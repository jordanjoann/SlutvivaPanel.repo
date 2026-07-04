import { describe, expect, it, vi } from "vitest";
import {
  buildPinResetEmail,
  buildWelcomeEmail,
  readEmailConfig,
  requireEmailConfig,
  sendPinResetEmail,
  sendWelcomeEmail,
} from "./email";

describe("readEmailConfig", () => {
  it("returns trimmed config when required values are present", () => {
    expect(
      readEmailConfig({
        RESEND_API_KEY: " re_test ",
        PANEL_EMAIL_FROM: " Slutvival <noreply@mail.slutvival.com> ",
        PANEL_PUBLIC_URL: " https://panel.slutvival.com/ ",
      }),
    ).toEqual({
      apiKey: "re_test",
      from: "Slutvival <noreply@mail.slutvival.com>",
      publicUrl: "https://panel.slutvival.com",
    });
  });

  it("returns null when email is not configured", () => {
    expect(readEmailConfig({})).toBeNull();
  });

  it("throws for partial config", () => {
    expect(() => requireEmailConfig({ RESEND_API_KEY: "re_test" })).toThrow(
      /Panel email configuration is incomplete/,
    );
  });
});

describe("email builders", () => {
  it("builds welcome email with username, role, and starting PIN", () => {
    const email = buildWelcomeEmail({
      loginUrl: "https://panel.slutvival.com/login",
      username: "Viewer",
      role: "viewer",
      pin: "1234",
    });

    expect(email.subject).toBe("Your Slutvival Panel login");
    expect(email.text).toContain("Viewer");
    expect(email.text).toContain("viewer");
    expect(email.text).toContain("1234");
    expect(email.html).toContain("https://panel.slutvival.com/login");
  });

  it("builds reset email with reset URL", () => {
    const email = buildPinResetEmail({
      resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
      expiresAt: new Date("2026-07-04T12:30:00.000Z"),
    });

    expect(email.subject).toBe("Reset your Slutvival Panel PIN");
    expect(email.text).toContain("https://panel.slutvival.com/reset-pin?token=abc");
    expect(email.html).toContain("https://panel.slutvival.com/reset-pin?token=abc");
  });
});

describe("send helpers", () => {
  it("sends welcome email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendWelcomeEmail(
      {
        to: "viewer@example.com",
        loginUrl: "https://panel.slutvival.com/login",
        username: "Viewer",
        role: "viewer",
        pin: "1234",
      },
      {
        apiKey: "re_test",
        from: "Slutvival <noreply@mail.slutvival.com>",
        publicUrl: "https://panel.slutvival.com",
      },
      { send },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Slutvival <noreply@mail.slutvival.com>",
        to: "viewer@example.com",
        subject: "Your Slutvival Panel login",
      }),
    );
  });

  it("sends PIN reset email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendPinResetEmail(
      {
        to: "viewer@example.com",
        resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
        expiresAt: new Date("2026-07-04T12:30:00.000Z"),
      },
      {
        apiKey: "re_test",
        from: "Slutvival <noreply@mail.slutvival.com>",
        publicUrl: "https://panel.slutvival.com",
      },
      { send },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "viewer@example.com",
        subject: "Reset your Slutvival Panel PIN",
      }),
    );
  });
});
