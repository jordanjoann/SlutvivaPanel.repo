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
  it("builds a concise welcome email with username and starting PIN", () => {
    const email = buildWelcomeEmail({
      loginUrl: "https://panel.slutvival.com",
      username: "Viewer",
      role: "viewer",
      pin: "1234",
    });

    expect(email.subject).toBe("Welcome to Slutvival");
    expect(email.text).toContain("Welcome to the Slutvival team!");
    expect(email.text).toContain("Visit https://panel.slutvival.com to gain access to your account.");
    expect(email.text).toContain("Username: Viewer");
    expect(email.text).toContain("PIN: 1234");
    expect(email.text).not.toContain("Role:");
    expect(email.html).toContain("Welcome to the Slutvival team!");
    expect(email.html).toContain("https://panel.slutvival.com");
  });

  it("builds a concise reset email with username and reset URL", () => {
    const email = buildPinResetEmail({
      username: "Viewer",
      resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
      expiresAt: new Date("2026-07-04T12:30:00.000Z"),
    });

    expect(email.subject).toBe("Reset your Slutvival PIN");
    expect(email.text).toContain("Hey Viewer!");
    expect(email.text).toContain("You seem to have forgotten your PIN. Click the link below to set a new one.");
    expect(email.text).toContain("https://panel.slutvival.com/reset-pin?token=abc");
    expect(email.text).toContain("This link expires in 24 hours and can only be used once.");
    expect(email.html).toContain("https://panel.slutvival.com/reset-pin?token=abc");
  });
});

describe("send helpers", () => {
  it("sends welcome email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendWelcomeEmail(
      {
        to: "viewer@example.com",
        loginUrl: "https://panel.slutvival.com",
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
        subject: "Welcome to Slutvival",
      }),
    );
  });

  it("sends PIN reset email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendPinResetEmail(
      {
        to: "viewer@example.com",
        username: "Viewer",
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
        subject: "Reset your Slutvival PIN",
      }),
    );
  });
});
