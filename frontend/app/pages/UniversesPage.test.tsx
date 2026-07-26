import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniversesPage } from "./UniversesPage";
import type { Universe } from "~/types";

const invalidateQueries = vi.fn();

let queryState: {
	data: Universe[] | undefined;
	isLoading: boolean;
	isError: boolean;
};

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries }),
	useQuery: () => queryState,
	useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("~/services/api", () => ({
	universesApi: {
		list: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock("~/components/layout/TopBar", () => ({
	TopBar: () => null,
}));

vi.mock("~/utils/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const renderPage = () =>
	render(
		<MemoryRouter>
			<UniversesPage />
		</MemoryRouter>,
	);

describe("UniversesPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryState = { data: [], isLoading: false, isError: false };
	});

	it("加载失败时显示错误面板而不是空态", async () => {
		queryState = { data: undefined, isLoading: false, isError: true };
		renderPage();

		expect(screen.getByText("宇宙列表加载失败")).toBeInTheDocument();
		expect(screen.queryByText("还没有 IP 宇宙")).toBeNull();

		await userEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["universes"],
		});
	});

	it("无数据且无错误时才显示空态", () => {
		renderPage();

		expect(screen.getByText("还没有 IP 宇宙")).toBeInTheDocument();
		expect(screen.queryByText("宇宙列表加载失败")).toBeNull();
	});

	it("列表包在「全部宇宙」DeskSection 区块中，空态直接坐纸面", () => {
		renderPage();

		const section = document.querySelector('[data-shell="desk-section"]');
		expect(section?.querySelector("h2")?.textContent).toBe("全部宇宙");
		// 空态是 EmptyState，而不是包一层 Card
		const empty = section?.querySelector('[data-shell="empty-state"]');
		expect(empty).not.toBeNull();
	});
});
