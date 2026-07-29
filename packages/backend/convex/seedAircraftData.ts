import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Seed aircraft metadata from airfleet-scraper CSV data hosted on GitHub.
 * Runs as a Convex action (can make HTTP requests).
 * Call via: npx convex run seedAircraftData
 */
export const seedAircraftData = action({
  args: {},
  handler: async (ctx) => {
    // CSV files from albert-torres/airfleet-scraper
    const base = "https://raw.githubusercontent.com/albert-torres/airfleet-scraper/master/data/";
    const files = [
      "airbus a220 status.csv", "airbus a300 status.csv", "airbus a310 status.csv",
      "airbus a318 status.csv", "airbus a319 status.csv", "airbus a320 status.csv",
      "airbus a330 status.csv", "airbus a350 status.csv", "airbus a380 status.csv",
      "boeing 717 status.csv", "boeing 737 status.csv", "boeing 747 status.csv",
      "boeing 757 status.csv", "boeing 777 status.csv", "boeing 787 status.csv",
      "civil airfleets status.csv", "comac ARJ21 status.csv", "comac c919 status.csv",
      "concorde status.csv", "lockheed l-1011 tristar status.csv",
      "mcdonnell douglas dc-10 status.csv", "mcdonnell douglas md-11 status.csv",
      "sukhoi superjet 100 status.csv",
    ];

    let total = 0;
    let inserted = 0;
    const errors: string[] = [];

    for (const fname of files) {
      const url = base + encodeURI(fname);
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          errors.push(`${fname}: HTTP ${resp.status}`);
          continue;
        }
        const text = await resp.text();

        // Parse CSV manually to avoid needing a CSV dep in Convex
        const lines = text.split("\n");
        if (lines.length < 2) continue;
        const headers = parseCSVLine(lines[0]);
        const regIdx = headers.indexOf("registration");
        const typeIdx = headers.indexOf("Type");
        const engineIdx = headers.indexOf("enginesType");
        const serialIdx = headers.indexOf("serialNumber");
        const operatorIdx = headers.indexOf("operator");
        const familyIdx = headers.indexOf("familyType");

        if (regIdx < 0) continue;

        let fileCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          const reg = (cols[regIdx] || "").trim();
          if (!reg || reg.length < 3) continue;

          const engineRaw = (cols[engineIdx] || "").trim();
          const engine = engineRaw.split("(x")[0]?.trim() || engineRaw;

          await ctx.runMutation(internal.aircraftMetadata.insertRow, {
            registration: reg,
            type: (cols[typeIdx] || cols[familyIdx] || "").trim(),
            engines: engine,
            serialNumber: (cols[serialIdx] || "").trim(),
            operator: (cols[operatorIdx] || "").trim(),
            family: (cols[familyIdx] || "").trim(),
          });

          fileCount++;
          total++;
        }
        inserted += fileCount;
        console.log(`  ${fname}: ${fileCount} rows`);
      } catch (e) {
        errors.push(`${fname}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      totalFiles: files.length,
      inserted,
      errors,
    };
  },
});

/** Naive CSV line parser (handles quoted fields). */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
