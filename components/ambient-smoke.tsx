"use client";

export function AmbientSmoke() {
  return (
    <>
      {/* Smog drift bands */}
      <div className="smog-layer" aria-hidden="true">
        <div
          className="smog-band"
          style={{ top: "15%", ["--smog-speed" as string]: "35s" }}
        />
        <div
          className="smog-band"
          style={{
            top: "55%",
            ["--smog-speed" as string]: "45s",
            animationDelay: "-15s",
            opacity: 0.7,
          }}
        />
      </div>

      {/* Floating smoke blobs */}
      <div
        className="smoke-blob"
        style={{
          width: "40vw",
          height: "40vw",
          top: "10%",
          left: "10%",
          ["--smoke-speed" as string]: "30s",
          ["--smoke-opacity" as string]: "0.04",
        }}
        aria-hidden="true"
      />
      <div
        className="smoke-blob"
        style={{
          width: "35vw",
          height: "35vw",
          top: "50%",
          right: "5%",
          ["--smoke-speed" as string]: "25s",
          ["--smoke-opacity" as string]: "0.03",
          animationDelay: "-10s",
        }}
        aria-hidden="true"
      />
      <div
        className="smoke-blob"
        style={{
          width: "50vw",
          height: "50vw",
          bottom: "5%",
          left: "30%",
          ["--smoke-speed" as string]: "40s",
          ["--smoke-opacity" as string]: "0.05",
          animationDelay: "-20s",
        }}
        aria-hidden="true"
      />
    </>
  );
}
