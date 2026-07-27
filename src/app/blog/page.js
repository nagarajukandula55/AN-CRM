"use client";

import { useEffect, useState } from "react";

export default function AdminBlogPanel() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    content: "",
    image: "",
    category: "General",
  });

  /* ================= FETCH BLOGS ================= */
  const fetchBlogs = async () => {
    const res = await fetch("/api/blog/list");
    const data = await res.json();
    setBlogs(data.blogs || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchBlogs();
  }, []);

  /* ================= CREATE BLOG ================= */
  const createBlog = async () => {
    if (!form.title || !form.content) return alert("Title & Content required");

    const res = await fetch("/api/blog/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (data.success) {
      alert("Blog created");
      setForm({
        title: "",
        excerpt: "",
        content: "",
        image: "",
        category: "General",
      });
      fetchBlogs();
    }
  };

  /* ================= DELETE BLOG ================= */
  const deleteBlog = async (id) => {
    if (!confirm("Delete this blog?")) return;

    await fetch(`/api/blog/delete/${id}`, {
      method: "DELETE",
    });

    fetchBlogs();
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Admin Blog Panel</h1>

      {/* FORM */}
      <div style={styles.form}>
        <input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <input
          placeholder="Image URL"
          value={form.image}
          onChange={(e) => setForm({ ...form, image: e.target.value })}
        />

        <input
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />

        <textarea
          placeholder="Excerpt"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />

        <textarea
          placeholder="Content"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          rows={6}
        />

        <button onClick={createBlog}>Create Blog</button>
      </div>

      {/* LIST */}
      <div style={styles.list}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          blogs.map((b) => (
            <div key={b._id} style={styles.card}>
              <img src={b.image} style={styles.img} />

              <div style={{ flex: 1 }}>
                <h3>{b.title}</h3>
                <p>{b.category}</p>
              </div>

              <button onClick={() => deleteBlog(b._id)} style={styles.delete}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */
const styles = {
  container: {
    padding: 30,
    maxWidth: 1000,
    margin: "auto",
  },

  title: {
    fontSize: 28,
    marginBottom: 20,
  },

  form: {
    display: "grid",
    gap: 10,
    marginBottom: 30,
  },

  list: {
    display: "grid",
    gap: 12,
  },

  card: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    border: "1px solid #ddd",
    padding: 10,
    borderRadius: 10,
  },

  img: {
    width: 80,
    height: 60,
    objectFit: "cover",
    borderRadius: 6,
  },

  delete: {
    background: "red",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
};
