import { describe, expect, it } from "vitest";
import { getProjectStatusMeta } from "./statusMeta";

describe("getProjectStatusMeta", () => {
	it("覆盖后端全部 5 个真实状态值", () => {
		for (const s of ["draft", "planning", "ready", "superseded", "failed"]) {
			const meta = getProjectStatusMeta(s);
			expect(meta.label).not.toBe("未知状态");
			expect(meta.label).toMatch(/[一-鿿]/);
		}
	});

	it("failed 映射为「生成失败」，与列表/工作台措辞一致", () => {
		expect(getProjectStatusMeta("failed").label).toBe("生成失败");
	});

	it("未知值兜底为中文，绝不把英文原始值渲染给用户", () => {
		for (const s of ["processing", "active", "whatever", "", null, undefined]) {
			expect(getProjectStatusMeta(s).label).toBe("未知状态");
		}
	});

	it("大小写与空白不敏感", () => {
		expect(getProjectStatusMeta(" Ready ").label).toBe(
			getProjectStatusMeta("ready").label,
		);
	});
});
