export default function Home() {
  return (
    <main className="onix-preview-shell">
      <iframe
        className="onix-preview"
        src="/onix/index.html"
        title="Onix Messenger"
        allow="camera; microphone; clipboard-read; clipboard-write; notifications"
      />
    </main>
  );
}
