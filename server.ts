import express from "express";
import { createServer as createViteServer } from "vite";
import { createArrayRouter } from "./packages/http/src/routes.js";
import { ArrayDB } from "./packages/core/src/database.js";

async function seedDemoData(db: any) {
  try {
    const existingDbs = await db.listDatabases();
    const hasCompany = existingDbs.some((d: any) => d.name === "company_db");
    const hasEcom = existingDbs.some((d: any) => d.name === "ecom_store");

    if (!hasCompany) {
      await db.createDatabase("company_db", "relational");
      const employees = await db.relational("company_db").createTable("employees", {
        primaryKey: "id",
        columns: {
          id: { type: "integer", primaryKey: true, autoIncrement: true },
          name: { type: "string", required: true },
          department: { type: "string", required: true },
          role: { type: "string", required: true },
          salary: { type: "number", default: 60000 },
          active: { type: "boolean", default: true },
          joined_date: { type: "date", default: () => new Date().toISOString() }
        }
      });

      await employees.insert([
        { name: "Sarah Chen", department: "Engineering", role: "Principal Architect", salary: 185000, active: true },
        { name: "Marcus Brody", department: "Engineering", role: "Systems Engineer", salary: 145000, active: true },
        { name: "Elena Rostova", department: "Product", role: "Lead Product Designer", salary: 135000, active: true },
        { name: "David Kim", department: "Sales", role: "Account Executive", salary: 110000, active: true },
        { name: "Amira Patel", department: "Sales", role: "Enterprise Sales Director", salary: 160000, active: true },
        { name: "Tariq Vance", department: "Marketing", role: "Content Strategist", salary: 95000, active: true }
      ]);
    }

    if (!hasEcom) {
      await db.createDatabase("ecom_store", "document");
      const products = await db.document("ecom_store").createCollection("products");

      await products.insertMany([
        {
          name: "Apex Mechanical Keyboard",
          sku: "KEY-APEX-01",
          price: 189.99,
          stock: 45,
          specs: { color: "Midnight Black", switch: "Cherry MX Red", layout: "ANSI" },
          tags: ["hardware", "peripherals", "gaming"],
          ratings: { score: 4.8, reviews: 142 }
        },
        {
          name: "Vantage Precision Mouse",
          sku: "MOU-VNT-02",
          price: 89.50,
          stock: 80,
          specs: { color: "Space Gray", sensor: "Optical 26K", wireless: true },
          tags: ["peripherals", "wireless", "productivity"],
          ratings: { score: 4.7, reviews: 98 }
        },
        {
          name: "Aura Studio Headphones",
          sku: "AUD-AUR-03",
          price: 249.00,
          stock: 19,
          specs: { color: "Matte White", noiseCancelling: true, batteryHours: 36 },
          tags: ["audio", "wireless", "premium"],
          ratings: { score: 4.9, reviews: 310 }
        },
        {
          name: "Spectra 4K Ultra Monitor",
          sku: "MON-SPC-04",
          price: 599.99,
          stock: 12,
          specs: { color: "Midnight Black", refreshRate: 144, panel: "IPS" },
          tags: ["displays", "4K", "hardware"],
          ratings: { score: 4.6, reviews: 64 }
        }
      ]);
    }
  } catch (err: any) {
    console.warn("[Array Seed] Demo data seeding notice:", err.message);
  }
}

async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize default database
  const defaultDb = new ArrayDB({
    provider: (process.env.ARRAY_PROVIDER as any) || "local",
    baseDir: process.env.ARRAY_DATA_DIR || "./.array_data"
  });
  await defaultDb.initialize();

  // Populate demonstration databases
  await seedDemoData(defaultDb);

  // Mount API router
  app.use("/api", createArrayRouter(defaultDb));

  // Mount Vite middlewares in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`[Array Platform] Server active at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("[Array Platform] Fatal server startup error:", err);
  process.exit(1);
});
