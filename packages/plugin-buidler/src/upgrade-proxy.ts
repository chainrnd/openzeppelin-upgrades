import { ethers, network, config } from '@nomiclabs/buidler';
import { readArtifact, BuidlerPluginError } from '@nomiclabs/buidler/plugins';
import fs from 'fs';

import { assertUpgradeSafe, assertStorageUpgradeSafe, getStorageLayout, fetchOrDeploy, getVersionId, Manifest } from '@openzeppelin/upgrades-core';

import { getProxyFactory } from './proxy-factory';

export async function upgradeProxy(proxyAddress: string, contractName: string) {
  const validations = JSON.parse(fs.readFileSync('cache/validations.json', 'utf8'));

  assertUpgradeSafe(validations, contractName);

  const ProxyFactory = await getProxyFactory();
  const proxy = ProxyFactory.attach(proxyAddress);

  const ImplFactory = await ethers.getContractFactory(contractName);
  const signer = await ImplFactory.signer.getAddress()

  const currentImplAddress = await proxy.callStatic.implementation({ from: signer });
  const manifest = new Manifest(await ethers.provider.send('eth_chainId', []));
  const deployment = await manifest.getDeploymentFromAddress(currentImplAddress);

  assertStorageUpgradeSafe(deployment.layout, getStorageLayout(validations, contractName));

  const artifact = await readArtifact(config.paths.artifacts, contractName);
  const version = getVersionId(artifact.deployedBytecode);
  const nextImpl = await fetchOrDeploy(version, network.provider, async () => {
    const { address } = await ImplFactory.deploy();
    const layout = getStorageLayout(validations, contractName);
    return { address, layout };
  });

  await proxy.upgradeTo(nextImpl);

  return ImplFactory.attach(proxyAddress);
}
