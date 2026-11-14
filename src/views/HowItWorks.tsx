import type { Dataset } from "../lib/artifacts";

export default function HowItWorks({ data }: { data: Dataset }) {
  return (
    <>
      <section className="hero">
        <div className="kicker">How it works</div>
        <h1>
          A short path from <span>photo to landscape references</span>
        </h1>
        <p>
          TerraTwin samples a global land grid, compares visual patterns, and opens a picture modal
          for each result. It helps you explore possibilities; it does not confirm a place.
        </p>
      </section>

      <div className="grid grid-2">
        <section className="panel">
          <div className="kicker">01 · Search</div>
          <h2>Start with a photo or browse the grid</h2>
          <p className="panel-sub">
            The reference index samples land areas using Natural Earth geometry and satellite imagery.
            It is a global reference search, not a complete map of every location.
          </p>
        </section>
        <section className="panel">
          <div className="kicker">02 · Compare</div>
          <h2>Review visual similarity</h2>
          <p className="panel-sub">
            Similarity is image-based and experimental. Satellite references are not ground photos,
            and a match is not exact geolocation or geological ground truth.
          </p>
        </section>
        <section className="panel">
          <div className="kicker">03 · Preview</div>
          <h2>Open the picture immediately</h2>
          <p className="panel-sub">
            Result cards provide the reference image and context without making the globe the only
            way to move through results.
          </p>
        </section>
        <section className="panel">
          <div className="kicker">Privacy and scope</div>
          <h2>Local photo flow, limited terrain model</h2>
          <p className="panel-sub">
            An uploaded photo is processed locally in the browser: no account is required and the
            photo is not uploaded. The original terrain ML dataset remains Egypt&apos;s Western Desert only.
          </p>
        </section>
      </div>

      <section className="panel">
        <h2>Sources and limits</h2>
        <p className="panel-sub" style={{ marginTop: 0 }}>
          Satellite reference imagery: EOX Sentinel-2 cloudless 2023, CC BY-NC-SA 4.0. Land
          sampling geometry: Natural Earth, public domain. Mars records and photographs: the existing
          supplied sources listed below.
        </p>
        <p className="note warn">
          Treat every result as a prompt for exploration, not a confirmed location or Earth–Mars
          analogue.
        </p>
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <p className="panel-sub" style={{ margin: 0 }}>
            Mars sample records: {data.mars.source}.
          </p>
          <p className="panel-sub" style={{ margin: 0 }}>
            Mars sample photographs: {data.mars.photo_credit}.
          </p>
          {data.samples.map((sample) => (
            <p className="panel-sub" key={sample.file} style={{ margin: 0 }}>
              {sample.credit} — {sample.license}.
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
