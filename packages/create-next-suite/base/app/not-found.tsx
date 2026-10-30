import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h2>Not found</h2>
      <p>Could not find the requested page.</p>
      <Link href="/">Return home</Link>
    </main>
  );
}
