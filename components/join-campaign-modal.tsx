"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const RIVETS = [
  { top: "14px", left: "14px" },
  { top: "14px", right: "14px" },
  { bottom: "14px", left: "14px" },
  { bottom: "14px", right: "14px" },
];

export function JoinCampaignModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  function open() {
    setIsOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setVisible(true))
    );
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  function close() {
    setVisible(false);
    setTimeout(() => {
      setIsOpen(false);
      setValue("");
      setError("");
    }, 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a campaign ID or invite link");
      return;
    }
    const match = trimmed.match(/campaign\/([a-zA-Z0-9-]+)/);
    const campaignId = match ? match[1] : trimmed;
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(campaignId)) {
      setError("Invalid campaign slug or link — check your coordinates");
      return;
    }
    router.push(`/campaign/${campaignId}/lobby`);
    close();
  }

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <>
      {/* Trigger */}
      <Button
        onClick={open}
        variant="outline"
        size="lg"
        className="border-gunmetal bg-transparent px-10 text-sm uppercase tracking-[0.15em] text-steam/80 transition-all duration-300 hover:border-copper hover:bg-smog/50 hover:text-steam"
      >
        Join Existing
      </Button>

      {/* Modal portal */}
      {mounted &&
        isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Join a campaign"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
            }}
          >
            {/* Backdrop */}
            <div
              onClick={close}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(13,12,10,0.88)",
                backdropFilter: "blur(6px)",
                transition: "opacity 350ms ease",
                opacity: visible ? 1 : 0,
              }}
            />

            {/* Panel */}
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "480px",
                background: "var(--smog)",
                border: "2px solid var(--copper)",
                clipPath:
                  "polygon(16px 0%, calc(100% - 16px) 0%, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0% calc(100% - 16px), 0% 16px)",
                boxShadow:
                  "0 0 0 1px var(--gunmetal), 0 32px 80px rgba(0,0,0,0.85), 0 0 60px rgba(184,115,51,0.12), inset 0 0 60px rgba(184,115,51,0.04), inset 1px 1px 0 rgba(255,255,255,0.03)",
                transition:
                  "opacity 350ms ease, transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                opacity: visible ? 1 : 0,
                transform: visible
                  ? "scale(1) translateY(0)"
                  : "scale(0.93) translateY(-16px)",
              }}
            >
              {/* Rivets */}
              {RIVETS.map((pos, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    ...pos,
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 35% 30%, var(--ash), var(--gunmetal))",
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.15)",
                    zIndex: 10,
                  }}
                />
              ))}

              {/* Header */}
              <div
                style={{
                  background:
                    "linear-gradient(180deg, var(--iron) 0%, var(--smog) 100%)",
                  borderBottom: "1px solid var(--gunmetal)",
                  padding: "1.5rem 1.75rem 1.25rem",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    className="brass-nameplate"
                    style={{ marginBottom: "0.5rem" }}
                  >
                    Boarding Pass
                  </div>
                  <h2
                    style={{
                      fontFamily: "var(--font-display), sans-serif",
                      fontSize: "1.625rem",
                      letterSpacing: "0.12em",
                      color: "var(--steam)",
                      margin: 0,
                      textTransform: "uppercase",
                      textShadow: "0 0 30px rgba(196,148,61,0.4)",
                    }}
                  >
                    Enter the Fray
                  </h2>
                </div>

                {/* Close valve button */}
                <button
                  onClick={close}
                  aria-label="Close"
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 40% 35%, var(--gunmetal), var(--iron))",
                    border: "2px solid var(--gunmetal)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow:
                      "0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
                    transition: "border-color 200ms, box-shadow 200ms",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--copper)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 8px rgba(0,0,0,0.5), 0 0 14px rgba(184,115,51,0.35), inset 0 1px 0 rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--gunmetal)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)";
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <line
                      x1="1"
                      y1="1"
                      x2="11"
                      y2="11"
                      stroke="var(--ash)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1="11"
                      y1="1"
                      x2="1"
                      y2="11"
                      stroke="var(--ash)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: "1.5rem 1.75rem 1.75rem" }}>
                <div className="iron-seam" style={{ marginBottom: "1.25rem" }} />

                <p
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--ash)",
                    marginBottom: "1.25rem",
                    textAlign: "center",
                    lineHeight: 1.7,
                  }}
                >
                  Paste an invite link or campaign slug
                  <br />
                  to join an existing adventure
                </p>

                <form onSubmit={handleSubmit}>
                  {/* Gauge-panel wrapped input */}
                  <div
                    style={{
                      background: "var(--iron)",
                      border: `2px solid ${error ? "var(--rust)" : "var(--copper)"}`,
                      borderRadius: "2px",
                      boxShadow: error
                        ? "inset 0 0 20px rgba(224,85,85,0.08)"
                        : "inset 0 0 20px rgba(184,115,51,0.08)",
                      padding: "0.625rem 0.875rem",
                      marginBottom: "0.875rem",
                      transition: "border-color 200ms, box-shadow 200ms",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.22em",
                        color: error ? "var(--rust)" : "var(--copper)",
                        marginBottom: "0.35rem",
                        transition: "color 200ms",
                      }}
                    >
                      Campaign Coordinates
                    </div>
                    <input
                      ref={inputRef}
                      value={value}
                      onChange={(e) => {
                        setValue(e.target.value);
                        setError("");
                      }}
                      placeholder="the-king-in-the-north-844f0c or invite URL"
                      autoComplete="off"
                      spellCheck={false}
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--steam)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.875rem",
                        letterSpacing: "0.04em",
                      }}
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <p
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.68rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "var(--rust)",
                        marginBottom: "0.875rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span aria-hidden="true">⚠</span> {error}
                    </p>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={close}
                      style={{
                        flexShrink: 0,
                        padding: "0.625rem 1.25rem",
                        background: "transparent",
                        border: "1px solid var(--gunmetal)",
                        color: "var(--ash)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        cursor: "pointer",
                        transition: "border-color 200ms, color 200ms",
                        clipPath:
                          "polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--ash)";
                        e.currentTarget.style.color = "var(--steam)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--gunmetal)";
                        e.currentTarget.style.color = "var(--ash)";
                      }}
                    >
                      Abort
                    </button>
                    <Button
                      type="submit"
                      size="lg"
                      className="group relative flex-1 overflow-hidden text-sm font-bold uppercase tracking-[0.15em] transition-all duration-500 hover:shadow-[0_0_30px_rgba(196,148,61,0.4),0_0_60px_rgba(196,148,61,0.15)]"
                    >
                      <span className="relative z-10">Board the Vessel</span>
                      <span
                        className="absolute inset-0 bg-gradient-to-r from-brass via-amber to-brass opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                </form>
              </div>

              {/* Steam vents along bottom edge */}
              <div
                className="steam-vent-container"
                style={{ height: "48px", bottom: 0 }}
              >
                {[15, 30, 50, 68, 82].map((pos, i) => (
                  <div
                    key={i}
                    className="steam-vent-puff"
                    style={
                      {
                        left: `${pos}%`,
                        "--steam-duration": `${2.5 + i * 0.35}s`,
                        animationDelay: `${i * 0.45}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
