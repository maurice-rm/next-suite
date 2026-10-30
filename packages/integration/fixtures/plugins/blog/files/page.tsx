import type { Metadata } from "next";
import { Suspense } from "react";

import { listPosts } from "./list-posts";

export const metadata: Metadata = {
  title: "Blog",
};

async function Posts() {
  const posts = await listPosts();
  if (posts.length === 0) {
    return <p>No posts yet.</p>;
  }
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>
          <h2>{post.title}</h2>
          <time dateTime={post.createdAt.toISOString()}>
            {post.createdAt.toLocaleDateString("en")}
          </time>
        </li>
      ))}
    </ul>
  );
}

export default function BlogPage() {
  return (
    <main>
      <h1>Blog</h1>
      <Suspense fallback={<p>Loading posts…</p>}>
        <Posts />
      </Suspense>
    </main>
  );
}
