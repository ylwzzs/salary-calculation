/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders title", () => {
  render(<App />);
  expect(screen.getByText("牛奶提成系统")).toBeInTheDocument();
});
