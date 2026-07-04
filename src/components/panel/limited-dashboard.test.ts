import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LimitedDashboard } from "./limited-dashboard";

describe("LimitedDashboard", () => {
  it("points admins and moderators at Vintage Story management", () => {
    for (const role of ["admin", "moderator"] as const) {
      const html = renderToStaticMarkup(React.createElement(LimitedDashboard, { role }));

      expect(html).toContain("Vintage Story");
      expect(html).toContain("/vintage-story");
      expect(html).not.toContain("does not have panel tools assigned");
    }
  });

  it("keeps viewers on the empty limited account dashboard", () => {
    const html = renderToStaticMarkup(React.createElement(LimitedDashboard, { role: "viewer" }));

    expect(html).toContain("does not have panel tools assigned");
    expect(html).not.toContain("/vintage-story");
  });
});
