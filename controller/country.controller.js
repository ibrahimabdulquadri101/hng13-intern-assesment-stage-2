import fs from "fs";
import path from "path";
import { pool } from "../db.js";
import { fetchData } from "../services/countryApi.js";

export const refreshData = async (req, res) => {
  let connection;
  try {
    const result = await fetchData();
    if (!result || !result.countriesData || !result.exchangeRates) {
      // Ensure we return 503 if external data fetch failed
      return res.status(503).json({
        error: "External data source unavailable",
        details:
          "Could not fetch data from restcountries.com or open.er-api.com",
      });
    }

    const { countriesData, exchangeRates } = result;

    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    for (const country of countriesData) {
      const name = country.name?.trim();
      const capital = country.capital || null;
      const region = country.region || null;
      const population = Number(country.population) || 0;
      const flag_url = country.flag || null;

      // currencies can be undefined or an array; take first code if exists
      const currencies = Array.isArray(country.currencies)
        ? country.currencies
        : [];
      const currency_code =
        currencies.length && currencies[0]?.code ? currencies[0].code : null;

      let exchange_rate = null;
      let estimated_gdp = null;

      if (currency_code === null) {
        // Spec: if no currency, set exchange_rate null and estimated_gdp = 0
        exchange_rate = null;
        estimated_gdp = 0;
      } else {
        // lookup rate (rates keyed by currency code)
        const rate =
          exchangeRates &&
          Object.prototype.hasOwnProperty.call(exchangeRates, currency_code)
            ? Number(exchangeRates[currency_code])
            : null;

        if (rate === null || Number.isNaN(rate)) {
          // currency not found in rates API
          exchange_rate = null;
          estimated_gdp = null;
        } else {
          exchange_rate = rate;
          // random multiplier 1000 - 2000 inclusive
          const multiplier = Math.floor(Math.random() * 1001) + 1000;
          // estimated_gdp = population * multiplier / exchange_rate
          estimated_gdp = (population * multiplier) / exchange_rate;
          // round to 2 decimals
          estimated_gdp = Number(estimated_gdp.toFixed(2));
        }
      }

      // Upsert: match by name (case-insensitive)
      const [rows] = await connection.execute(
        "SELECT id FROM countries WHERE LOWER(name) = LOWER(?) LIMIT 1",
        [name]
      );

      if (rows.length) {
        const id = rows[0].id;
        await connection.execute(
          `UPDATE countries SET
            capital = ?,
            region = ?,
            population = ?,
            currency_code = ?,
            exchange_rate = ?,
            estimated_gdp = ?,
            flag_url = ?,
            last_refreshed_at = NOW()
          WHERE id = ?`,
          [
            capital,
            region,
            population,
            currency_code,
            exchange_rate,
            estimated_gdp,
            flag_url,
            id,
          ]
        );
      } else {
        await connection.execute(
          `INSERT INTO countries
            (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            name,
            capital,
            region,
            population,
            currency_code,
            exchange_rate,
            estimated_gdp,
            flag_url,
          ]
        );
      }
    }

    await connection.commit();

    // After successful DB update, generate summary image
    // Ensure cache dir exists
    const cacheDir = path.join(process.cwd(), "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // Fetch summary data
    const [[{ total }]] = await connection.query(
      "SELECT COUNT(*) AS total FROM countries"
    );
    const [topRows] = await connection.query(
      "SELECT name, estimated_gdp FROM countries WHERE estimated_gdp IS NOT NULL ORDER BY estimated_gdp DESC LIMIT 5"
    );

    const timestamp = new Date().toISOString();

    // Generate summary image — use SVG + sharp (more reliable than Jimp fonts)
    try {
      const sharpModule = await import("sharp");
      const sharp = sharpModule.default || sharpModule;

      const width = 1000;
      const height = 600;

      // build top 5 rows HTML
      const rowsHtml = topRows
        .map((r, i) => {
          const gdpText =
            r.estimated_gdp !== null
              ? Number(r.estimated_gdp).toLocaleString()
              : "N/A";
          return `<tspan x="60" dy="${i === 0 ? 0 : 28}">${i + 1}. ${escapeHtml(
            r.name
          )} — ${escapeHtml(gdpText)}</tspan>`;
        })
        .join("");

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <style>
          .title { font: 28px sans-serif; fill: #111; font-weight:700; }
          .label { font: 18px sans-serif; fill: #222; }
          .list { font: 16px sans-serif; fill: #333; }
        </style>
        <text x="40" y="50" class="title">Countries Summary</text>
        <text x="40" y="95" class="label">Total countries: ${escapeHtml(
          String(total)
        )}</text>
        <text x="40" y="125" class="label">Last refreshed at: ${escapeHtml(
          timestamp
        )}</text>
        <text x="40" y="170" class="label">Top 5 countries by estimated GDP:</text>
        <text x="60" y="200" class="list">${rowsHtml}</text>
      </svg>`;

      const outPath = path.join(cacheDir, "summary.png");
      await sharp(Buffer.from(svg)).png().toFile(outPath);
    } catch (imgErr) {
      console.error("Summary image generation skipped due to error:", imgErr);
    }

    return res.status(200).json({
      message: "Data refresh successful",
      last_refreshed_at: timestamp,
    });
  } catch (error) {
    console.log(error);
    try {
      if (connection) {
        await connection.rollback();
      }
    } catch (rbErr) {
      // ignore rollback error
    }
    if (
      error &&
      error.message &&
      error.message.includes("External data source")
    ) {
      return res.status(503).json({
        error: "External data source unavailable",
        details:
          "Could not fetch data from restcountries.com or open.er-api.com",
      });
    }
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};

export const getCountries = async (req, res) => {
  try {
    const { region, currency, sort } = req.query;

    // allowed sorts
    const sortMap = {
      gdp_desc: "estimated_gdp DESC",
      gdp_asc: "estimated_gdp ASC",
      name_asc: "name ASC",
      name_desc: "name DESC",
      population_desc: "population DESC",
      population_asc: "population ASC",
    };

    let orderBy = "name ASC";
    if (sort) {
      if (!Object.prototype.hasOwnProperty.call(sortMap, sort)) {
        return res.status(400).json({ error: "Invalid sort value" });
      }
      orderBy = sortMap[sort];
    }

    const where = [];
    const params = [];

    if (region) {
      where.push("region = ?");
      params.push(region);
    }

    if (currency) {
      where.push("currency_code = ?");
      params.push(String(currency).toUpperCase());
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT id, name, capital, region, population,
             currency_code, exchange_rate, estimated_gdp,
             flag_url, last_refreshed_at
      FROM countries
      ${whereSql}
      ORDER BY ${orderBy}
    `;

    const [rows] = await pool.promise().query(sql, params);

    const result = rows.map((r) => ({
      id: r.id,
      name: r.name,
      capital: r.capital,
      region: r.region,
      population: Number(r.population),
      currency_code: r.currency_code,
      exchange_rate: r.exchange_rate === null ? null : Number(r.exchange_rate),
      estimated_gdp: r.estimated_gdp === null ? null : Number(r.estimated_gdp),
      flag_url: r.flag_url,
      last_refreshed_at: r.last_refreshed_at
        ? new Date(r.last_refreshed_at).toISOString()
        : null,
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error("getCountries error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getCountryByName = async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: { name: "is required" } });
    }

    const sql = `
      SELECT id, name, capital, region, population,
             currency_code, exchange_rate, estimated_gdp,
             flag_url, last_refreshed_at
      FROM countries
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
    `;

    const [rows] = await pool.promise().query(sql, [name.trim()]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Country not found" });
    }

    const r = rows[0];
    const result = {
      id: r.id,
      name: r.name,
      capital: r.capital,
      region: r.region,
      population: Number(r.population),
      currency_code: r.currency_code,
      exchange_rate: r.exchange_rate === null ? null : Number(r.exchange_rate),
      estimated_gdp: r.estimated_gdp === null ? null : Number(r.estimated_gdp),
      flag_url: r.flag_url,
      last_refreshed_at: r.last_refreshed_at
        ? new Date(r.last_refreshed_at).toISOString()
        : null,
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error("getCountryByName error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteCountryByName = async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: { name: "is required" } });
    }

    const trimmed = name.trim();
    const [result] = await pool
      .promise()
      .execute("DELETE FROM countries WHERE LOWER(name) = LOWER(?)", [trimmed]);

    // result is an OkPacket with affectedRows
    const affected = result && result.affectedRows ? result.affectedRows : 0;
    if (affected === 0) {
      return res.status(404).json({ error: "Country not found" });
    }

    return res.status(200).json({ message: "Country deleted" });
  } catch (err) {
    console.error("deleteCountryByName error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getStatus = async (req, res) => {
  try {
    const [rows] = await pool
      .promise()
      .query(
        "SELECT COUNT(*) AS total, MAX(last_refreshed_at) AS last_refreshed_at FROM countries"
      );

    const row =
      rows && rows[0] ? rows[0] : { total: 0, last_refreshed_at: null };
    const lastRefreshedAt = row.last_refreshed_at
      ? new Date(row.last_refreshed_at).toISOString()
      : null;

    return res.status(200).json({
      total_countries: Number(row.total),
      last_refreshed_at: lastRefreshedAt,
    });
  } catch (err) {
    console.error("getStatus error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Add this function to serve the summary image
export const getSummaryImage = async (req, res) => {
  try {
    const filePath = path.join(process.cwd(), "cache", "summary.png");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Summary image not found" });
    }
    return res.sendFile(filePath);
  } catch (err) {
    console.error("getSummaryImage error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// helper: simple html escape to avoid SVG injection
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
