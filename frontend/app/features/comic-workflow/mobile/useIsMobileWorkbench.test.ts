import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsMobileWorkbench } from "./useIsMobileWorkbench";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useIsMobileWorkbench", () => {
	it("falls back to desktop when matchMedia is unavailable (jsdom)", () => {
		const { result } = renderHook(() => useIsMobileWorkbench());

		expect(result.current).toBe(false);
	});

	it("reports mobile when the <lg media query matches", () => {
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				matches: true,
				media: "(max-width: 1023.98px)",
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		);

		const { result } = renderHook(() => useIsMobileWorkbench());

		expect(result.current).toBe(true);
	});
});
