import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { SignedOut } from "../src/App.tsx";

describe("SignedOut", () => {
  it("offers GitHub sign-in", () => {
    render(<SignedOut />);
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
  });
});
