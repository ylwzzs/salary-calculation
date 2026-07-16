/// <reference types="vitest/globals" />
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../auth";
import Login from "../pages/Login";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    authApi: {
      login: vi.fn(async () => ({ token: "T" })),
      me: vi.fn(async () => ({ username: "admin" })),
    },
  };
});

afterEach(() => localStorage.clear());

function Probe() {
  const { user } = useAuth();
  return <div data-testid="probe">{user ? `ok:${user.username}` : "no"}</div>;
}

describe("Login", () => {
  it("logs in and sets user", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText("账号"), "admin");
    await userEvent.type(screen.getByPlaceholderText("密码"), "admin");
    // antd Button auto-inserts a space between the two CJK chars ("登 录").
    await userEvent.click(screen.getByRole("button", { name: /登\s*录/ }));
    expect(await screen.findByText("ok:admin")).toBeInTheDocument();
  });
});
