import type { ApiStatus } from "@/lib/types";

interface HeroSectionProps {
  apiStatus: ApiStatus;
}

function getStatusCopy(status: ApiStatus) {
  if (status === "online") {
    return "API online";
  }

  if (status === "offline") {
    return "API offline";
  }

  return "Checking API...";
}

export default function HeroSection({ apiStatus }: HeroSectionProps) {
  return (
    <section className="hero-card">
      <div className="background-glow glow-left" />
      <div className="background-glow glow-right" />

      <div className="eyebrow-row">
        <span className="eyebrow">Batch Fraud Detection</span>
        <span className={`status-pill ${apiStatus}`}>{getStatusCopy(apiStatus)}</span>
      </div>

      <h1>Analyze suspicious transaction patterns without mixing tenant partitions.</h1>
      <p className="hero-copy">
        Upload anonymized CSV transaction data, run configurable batch processing, and review
        high-risk alerts generated from rolling anomaly detection windows.
      </p>

      <div className="hero-metrics">
        <article>
          <span>Frontend</span>
          <strong>Astro + React</strong>
        </article>
        <article>
          <span>Backend</span>
          <strong>FastAPI + Pandas</strong>
        </article>
        <article>
          <span>Isolation</span>
          <strong>Source Partition Aware</strong>
        </article>
      </div>
    </section>
  );
}
