import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageHeader } from "./PageHeader";

function getHeader(container: HTMLElement) {
	const header = container.querySelector('[data-shell="page-header"]');
	expect(header).not.toBeNull();
	return header as HTMLElement;
}

describe("PageHeader", () => {
	it("默认变体保持列表页行为：divider + 移动端 actions 换行到标题下", () => {
		const { container } = render(
			<PageHeader title="项目" actions={<button type="button">新建</button>} />,
		);
		const header = getHeader(container);
		expect(header.className).toContain("border-b");
		expect(header.className).toContain("flex-col");
		expect(header.className).toContain("lg:flex-row");
	});

	it('actionsAlign="title" 让 actions 全断点钉在标题行', () => {
		const { container } = render(
			<PageHeader
				title="创作台"
				actionsAlign="title"
				actions={<button type="button">历史</button>}
			/>,
		);
		const header = getHeader(container);
		expect(header.className).toContain("flex-row");
		expect(header.className).toContain("items-center");
		expect(header.className).not.toContain("flex-col");
	});

	it("divider={false} 去掉底部分隔线", () => {
		const { container } = render(<PageHeader title="无分隔线" divider={false} />);
		const header = getHeader(container);
		expect(header.className).not.toContain("border-b");
	});
});
