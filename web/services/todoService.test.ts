import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { todoService } from "./todoService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";
import type { CreateTodoRequest, UpdateTodoRequest, TodoQuery } from "@/types";

describe("todoService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  describe("create", () => {
    it("应该调用 create_todo 并返回新建的 Todo", async () => {
      const request = { title: "Task" } as unknown as CreateTodoRequest;
      const todo = { id: "t-1", title: "Task" };
      mockTauriInvoke({ create_todo: todo });

      const result = await todoService.create(request);

      expect(invoke).toHaveBeenCalledWith("create_todo", { request });
      expect(result).toEqual(todo);
    });
  });

  describe("get", () => {
    it("应该调用 get_todo 并返回 Todo", async () => {
      const todo = { id: "t-1", title: "Task" };
      mockTauriInvoke({ get_todo: todo });

      const result = await todoService.get("t-1");

      expect(invoke).toHaveBeenCalledWith("get_todo", { id: "t-1" });
      expect(result).toEqual(todo);
    });

    it("应该在不存在时返回 null", async () => {
      mockTauriInvoke({ get_todo: null });

      const result = await todoService.get("missing");

      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("应该调用 update_todo 并传递 id 和请求", async () => {
      const request = { title: "Renamed" } as unknown as UpdateTodoRequest;
      const todo = { id: "t-1", title: "Renamed" };
      mockTauriInvoke({ update_todo: todo });

      const result = await todoService.update("t-1", request);

      expect(invoke).toHaveBeenCalledWith("update_todo", { id: "t-1", request });
      expect(result).toEqual(todo);
    });
  });

  describe("delete", () => {
    it("应该调用 delete_todo", async () => {
      mockTauriInvoke({ delete_todo: undefined });

      await todoService.delete("t-1");

      expect(invoke).toHaveBeenCalledWith("delete_todo", { id: "t-1" });
    });
  });

  describe("query", () => {
    it("应该调用 query_todos 并返回查询结果", async () => {
      const query = { status: "todo", limit: 10, offset: 0 } as unknown as TodoQuery;
      const queryResult = { items: [], total: 0 };
      mockTauriInvoke({ query_todos: queryResult });

      const result = await todoService.query(query);

      expect(invoke).toHaveBeenCalledWith("query_todos", { query });
      expect(result).toEqual(queryResult);
    });
  });

  describe("reorder", () => {
    it("应该调用 reorder_todos 并传递 id 列表", async () => {
      mockTauriInvoke({ reorder_todos: undefined });

      await todoService.reorder(["t-2", "t-1"]);

      expect(invoke).toHaveBeenCalledWith("reorder_todos", {
        todoIds: ["t-2", "t-1"],
      });
    });
  });

  describe("batchUpdateStatus", () => {
    it("应该调用 batch_update_todo_status 并返回更新数量", async () => {
      mockTauriInvoke({ batch_update_todo_status: 2 });

      const result = await todoService.batchUpdateStatus(["t-1", "t-2"], "done");

      expect(invoke).toHaveBeenCalledWith("batch_update_todo_status", {
        ids: ["t-1", "t-2"],
        status: "done",
      });
      expect(result).toBe(2);
    });
  });

  describe("stats", () => {
    it("应该调用 get_todo_stats 并透传 scope 参数", async () => {
      const stats = { total: 5, done: 2 };
      mockTauriInvoke({ get_todo_stats: stats });

      const result = await todoService.stats({
        scope: "project" as never,
        scopeRef: "/tmp/project",
      });

      expect(invoke).toHaveBeenCalledWith("get_todo_stats", {
        scope: "project",
        scopeRef: "/tmp/project",
      });
      expect(result).toEqual(stats);
    });

    it("应该在无参数时传递空 scope", async () => {
      mockTauriInvoke({ get_todo_stats: { total: 0 } });

      await todoService.stats();

      expect(invoke).toHaveBeenCalledWith("get_todo_stats", {
        scope: undefined,
        scopeRef: undefined,
      });
    });
  });

  describe("toggleMyDay", () => {
    it("应该调用 toggle_todo_my_day", async () => {
      const todo = { id: "t-1", myDay: true };
      mockTauriInvoke({ toggle_todo_my_day: todo });

      const result = await todoService.toggleMyDay("t-1");

      expect(invoke).toHaveBeenCalledWith("toggle_todo_my_day", { id: "t-1" });
      expect(result).toEqual(todo);
    });
  });

  describe("checkReminders", () => {
    it("应该调用 check_todo_reminders 并返回到期 Todo", async () => {
      const due = [{ id: "t-1" }];
      mockTauriInvoke({ check_todo_reminders: due });

      const result = await todoService.checkReminders();

      expect(invoke).toHaveBeenCalledWith("check_todo_reminders");
      expect(result).toEqual(due);
    });
  });

  describe("子任务", () => {
    it("addSubtask 应该调用 add_todo_subtask", async () => {
      const subtask = { id: "st-1", title: "Sub" };
      mockTauriInvoke({ add_todo_subtask: subtask });

      const result = await todoService.addSubtask("t-1", "Sub");

      expect(invoke).toHaveBeenCalledWith("add_todo_subtask", {
        todoId: "t-1",
        title: "Sub",
      });
      expect(result).toEqual(subtask);
    });

    it("updateSubtask 应该调用 update_todo_subtask 并透传可选参数", async () => {
      mockTauriInvoke({ update_todo_subtask: true });

      const result = await todoService.updateSubtask("st-1", "New title", true);

      expect(invoke).toHaveBeenCalledWith("update_todo_subtask", {
        id: "st-1",
        title: "New title",
        completed: true,
      });
      expect(result).toBe(true);
    });

    it("deleteSubtask 应该调用 delete_todo_subtask", async () => {
      mockTauriInvoke({ delete_todo_subtask: undefined });

      await todoService.deleteSubtask("st-1");

      expect(invoke).toHaveBeenCalledWith("delete_todo_subtask", { id: "st-1" });
    });

    it("toggleSubtask 应该调用 toggle_todo_subtask 并返回新状态", async () => {
      mockTauriInvoke({ toggle_todo_subtask: false });

      const result = await todoService.toggleSubtask("st-1");

      expect(invoke).toHaveBeenCalledWith("toggle_todo_subtask", { id: "st-1" });
      expect(result).toBe(false);
    });

    it("reorderSubtasks 应该调用 reorder_todo_subtasks", async () => {
      mockTauriInvoke({ reorder_todo_subtasks: undefined });

      await todoService.reorderSubtasks(["st-2", "st-1"]);

      expect(invoke).toHaveBeenCalledWith("reorder_todo_subtasks", {
        subtaskIds: ["st-2", "st-1"],
      });
    });
  });
});
