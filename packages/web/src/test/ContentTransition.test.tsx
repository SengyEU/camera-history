/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ContentTransition } from "../ContentTransition";

const enterNext = () => document.querySelector(".content-enter-next");
const enterPrev = () => document.querySelector(".content-enter-prev");
const exitNext = () => document.querySelector(".content-exit-next");
const exitPrev = () => document.querySelector(".content-exit-prev");
const layerCount = () => document.querySelectorAll(".content-layer").length;

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

  it("keeps the old layer under the new one and removes it after settling", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" direction="next" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(1);

    rerender(
      <ContentTransition transitionKey="b" direction="next" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(2);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(enterNext()).not.toBeNull();
    const leaving = exitNext();
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("aria-hidden", "true");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(exitNext()).toBeNull();
  });

  it("updates the live layer while the old layer is leaving", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" direction="next" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" direction="next" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" direction="next" animate>
        <Content label="B2" />
      </ContentTransition>,
    );
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B2")).toBeInTheDocument();
  });

  it("slides the new layer from the left and the old layer to the right for prev", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="b" direction="next" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="a" direction="prev" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    expect(enterPrev()).not.toBeNull();
    expect(enterNext()).toBeNull();
    expect(exitPrev()).not.toBeNull();
    expect(exitNext()).toBeNull();
  });

  it("replaces a pending transition on rapid switching without stacking layers", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" direction="next" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" direction="next" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="c" direction="prev" animate>
        <Content label="C" />
      </ContentTransition>,
    );
    expect(layerCount()).toBe(2);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("swaps instantly under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { rerender } = render(
      <ContentTransition transitionKey="a" direction="next" animate>
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" direction="next" animate>
        <Content label="B" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(exitNext()).toBeNull();
  });

  it("swaps instantly when animate is false (default in test runs)", () => {
    const { rerender } = render(
      <ContentTransition transitionKey="a" direction="next">
        <Content label="A" />
      </ContentTransition>,
    );
    rerender(
      <ContentTransition transitionKey="b" direction="next">
        <Content label="B" />
      </ContentTransition>,
    );
    expect(screen.getAllByTestId("content")).toHaveLength(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(exitNext()).toBeNull();
  });
});
