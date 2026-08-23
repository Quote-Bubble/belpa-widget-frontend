/**
 * Streams into the iframe while `page.tsx` waits on fetchRooferConfig, so a
 * launch.js click is not a blank transparent frame for the whole API round
 * trip.
 */
export default function WidgetLoading() {
  return (
    <div className="belpa-embed-page" aria-busy="true">
      <div className="belpa-bubble-host mx-auto w-full">
        <div className="q" style={{ height: 544 }} />
      </div>
    </div>
  );
}
