import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  listSshMachines,
  getSshMachine,
  addSshMachine,
  updateSshMachine,
  removeSshMachine,
  checkSshConnectivity,
  discoverWslDistros,
} from "./sshMachineService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";
import type { SshMachineUpsertRequest } from "@/types";

const originalTauriInternals = window.__TAURI_INTERNALS__;

function createRequest(): SshMachineUpsertRequest {
  return {
    name: "dev-box",
    host: "192.168.1.10",
    port: 22,
    username: "dev",
  } as unknown as SshMachineUpsertRequest;
}

describe("sshMachineService", () => {
  beforeEach(() => {
    resetTauriInvoke();
    window.__TAURI_INTERNALS__ = originalTauriInternals ?? {};
  });

  afterEach(() => {
    window.__TAURI_INTERNALS__ = originalTauriInternals;
  });

  describe("listSshMachines", () => {
    it("应该调用 list_ssh_machines 并返回机器列表", async () => {
      const machines = [{ id: "m-1", name: "dev-box" }];
      mockTauriInvoke({ list_ssh_machines: machines });

      const result = await listSshMachines();

      expect(invoke).toHaveBeenCalledWith("list_ssh_machines");
      expect(result).toEqual(machines);
    });
  });

  describe("getSshMachine", () => {
    it("应该调用 get_ssh_machine", async () => {
      const machine = { id: "m-1", name: "dev-box" };
      mockTauriInvoke({ get_ssh_machine: machine });

      const result = await getSshMachine("m-1");

      expect(invoke).toHaveBeenCalledWith("get_ssh_machine", { id: "m-1" });
      expect(result).toEqual(machine);
    });

    it("应该在不存在时返回 null", async () => {
      mockTauriInvoke({ get_ssh_machine: null });

      const result = await getSshMachine("missing");

      expect(result).toBeNull();
    });
  });

  describe("addSshMachine", () => {
    it("应该调用 add_ssh_machine 并返回新建的机器", async () => {
      const request = createRequest();
      const machine = { id: "m-1", name: "dev-box" };
      mockTauriInvoke({ add_ssh_machine: machine });

      const result = await addSshMachine(request);

      expect(invoke).toHaveBeenCalledWith("add_ssh_machine", { request });
      expect(result).toEqual(machine);
    });
  });

  describe("updateSshMachine", () => {
    it("应该调用 update_ssh_machine", async () => {
      const request = createRequest();
      const machine = { id: "m-1", name: "dev-box" };
      mockTauriInvoke({ update_ssh_machine: machine });

      const result = await updateSshMachine(request);

      expect(invoke).toHaveBeenCalledWith("update_ssh_machine", { request });
      expect(result).toEqual(machine);
    });
  });

  describe("removeSshMachine", () => {
    it("应该调用 remove_ssh_machine", async () => {
      mockTauriInvoke({ remove_ssh_machine: undefined });

      await removeSshMachine("m-1");

      expect(invoke).toHaveBeenCalledWith("remove_ssh_machine", { id: "m-1" });
    });
  });

  describe("checkSshConnectivity", () => {
    it("应该调用 check_ssh_connectivity 并返回连通性结果", async () => {
      const check = { ok: true, latencyMs: 15 };
      mockTauriInvoke({ check_ssh_connectivity: check });

      const result = await checkSshConnectivity("m-1");

      expect(invoke).toHaveBeenCalledWith("check_ssh_connectivity", { id: "m-1" });
      expect(result).toEqual(check);
    });
  });

  describe("discoverWslDistros", () => {
    it("应该调用 discover_wsl_distros 并返回分发版列表", async () => {
      const distros = [{ name: "Ubuntu", isDefault: true }];
      mockTauriInvoke({ discover_wsl_distros: distros });

      const result = await discoverWslDistros();

      expect(invoke).toHaveBeenCalledWith("discover_wsl_distros");
      expect(result).toEqual(distros);
    });

    it("应该在 Web 运行时直接返回空数组", async () => {
      delete window.__TAURI_INTERNALS__;

      const result = await discoverWslDistros();

      expect(result).toEqual([]);
      expect(invoke).not.toHaveBeenCalled();
    });
  });
});
