/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders login form when unauthenticated", () => {
  render(<App />);
  expect(screen.getByPlaceholderText("账号")).toBeInTheDocument();
});
