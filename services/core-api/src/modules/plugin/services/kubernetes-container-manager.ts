// services/kubernetes-container-manager.ts
// Kubernetes hosting implementation — placeholder for production use.

import { PluginInstallError } from '../errors.js';

import type { ContainerManager, ContainerInfo, ContainerStatus } from './container-manager.service.js';
import type { Manifest } from '../schema/manifest.js';

export class KubernetesContainerManager implements ContainerManager {
  async startContainer(_installId: string, _manifest: Manifest): Promise<ContainerInfo> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI. ' +
        'Kubernetes support requires deployment in a Kubernetes cluster.'
    );
  }

  async stopContainer(_installId: string): Promise<void> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }

  async getContainerStatus(_installId: string): Promise<ContainerStatus> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }

  async getContainerUrl(_installId: string): Promise<string> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }

  async restartContainer(_installId: string): Promise<void> {
    throw new PluginInstallError(
      'Kubernetes hosting is not available in this environment. ' +
        'Use hosting.type = "sidecar" for dev/CI.'
    );
  }
}
