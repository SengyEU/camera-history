/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ContentTransition } from "../ContentTransition";

const exitLayer = () => document.querySelector(".content-exit");
const enterLayer = () => document.querySelector(".content-enter");
const layerCount = () => document.querySelectorAll(".content-layer").length;
const SETTLE = 900;

function Content({ label }: { label: string }) {
  return <p data-testid="content">{label}</p>;
}

describe("ContentTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not animate the very first content on mount", () => {
    render(
      <ContentTransition transitionKey="a" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(enterLayer()).toBeNull();
    expect(exitLayer()).toBeNull();
  });

  it("keeps the old layer above the new one while it fades out", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(2);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(enterLayer()).not.toBeNull();
    const leaving = exitLayer();
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("aria-hidden", "true");

    act(() => {
      vi.advanceTimersByTime(SETTLE);
    });
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(exitLayer()).toBeNull();
    expect(enterLayer()).toBeNull();
  });

  it("updates the live layer while the old layer is leaving", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" animate>
        <Content label="B2" />
      </ContentTransition>,
    );
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SETTLE);
    });
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B2")).toBeInTheDocument();
  });

  it("replaces a pending transition on rapid switching without stacking layers", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="c" animate>
        <Content label="C" />
      </ContentTransition>,
    );
    expect(layerCount()).toBe(2);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SETTLE);
    });
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("swaps instantly under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { rerender } = render(
      <ContentTransition transitionKey="a" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(exitLayer()).toBeNull();
  });

  it("swaps instantly when animate is false (default in test runs)", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a">
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b">
        <Content label="B" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(exitLayer()).toBeNull();
  });
});
