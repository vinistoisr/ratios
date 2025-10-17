# The Iron Vanguard · Financial Ratios Builder

<img width="1888" height="921" alt="image" src="https://github.com/user-attachments/assets/fbd83f83-c7d1-46e2-a0be-40dba0ee35a0" />


## 📌 Overview

This project was built as part of the **MBA 520 course at the University of Victoria (Class of 2025)** under the instruction of **Professor [Insert Teacher’s Name]**.  
Our team — **The Iron Vanguard** — created this tool to **explore, calculate, and compare financial ratios across public companies** using real financial statement data.

The site provides an interactive interface for selecting tickers, fetching statements from Alpha Vantage, and dynamically building custom ratios for analysis and discussion.

---

## 🎯 Purpose

In class, we often analyze companies using common ratios (e.g., ROE, Current Ratio, Net Margin). The challenge is that gathering and organizing raw statements for multiple firms is tedious.  
This project was designed to:

- Automate the retrieval of financial statements.
- Make ratio calculations transparent and customizable.
- Encourage exploration of "what-if" analysis with drag-and-drop building blocks.
- Provide a **visual and interactive supplement** to traditional spreadsheet work.

The broader learning goal: to connect **financial theory** with **practical data analysis** and to better understand how ratios shape investment and management decisions.

---

## 👥 Team Members

- **Vincent Royer**  
- **[Other Team Members’ Names]**  
- **University of Victoria – MBA 520 (Class of 2025)**  
- Instructor: **[Instructor’s Full Name]**

---

## 🛠️ Technologies Used

- **React 18 (with JSX via Babel)** – For building an interactive UI in a single HTML file.
- **TailwindCSS (CDN)** – For modern, responsive styling with minimal setup.
- **Cloudflare Pages + Functions** – Serverless deployment and backend proxying of API requests.
- **Alpha Vantage API** – Free source of financial statements and company overviews.
- **LocalStorage** – Lightweight client-side persistence for cached data.
- **Cloudflare Edge Caching** – Shared caching layer so all users benefit once a ticker is fetched.

We deliberately kept the stack simple: no database, no heavy build pipeline, no backend persistence. This makes the app lightweight and easy to deploy.

---

## 📊 Features

- Add multiple company tickers and retrieve their financial statements.
- Drag and drop financial statement items into a **Ratio Builder**.
- Predefined common ratios (ROE, Gross Margin, Current Ratio, etc.).
- Year-by-year comparison of companies in a structured table.
- AI summary panel that generates text comparing chosen ratios (experimental).
- **Caching layers** (see below) to keep the app responsive and API-friendly.

---

## ⚡ Lessons Learned (API & Performance)

Using Alpha Vantage taught us important lessons:

1. **Rate limits are strict**:  
   Alpha Vantage allows ~75 requests per minute per API key. Fetching four statements per ticker meant it was easy to overload the quota.

2. **Bundling reduces calls**:  
   We built a **bundle endpoint** in our Cloudflare Function so one request retrieves all four statements (Income, Balance, Cash Flow, Overview). This cut load time and API usage drastically.

3. **Caching is essential**:  
   Without caching, even a single user could hit the rate limit. With caching, dozens of students can explore the same ticker without extra load.

---

## 🗂️ Caching System

The project uses **three levels of caching**:

1. **In-tab memory (`Map`)** – Prevents duplicate concurrent requests during a session.
2. **LocalStorage (72h TTL)** – Persists results across reloads so users don’t repeatedly fetch the same ticker.
3. **Cloudflare Edge Cache (72h TTL + 24h stale-while-revalidate)** – Shared across all users; once one person fetches a ticker, others benefit.

This layered approach ensures fast responses and stays under API limits.

---

## 🏗️ Development Timeline

- **Fall 2025** – Project conceived and implemented as a team deliverable.  
- Built in about **2–3 weeks**, balancing coursework, learning curve, and experimenting with new tools.  
- First version deployed on **Cloudflare Pages** with live updates from GitHub.

---

## 📚 How It Works (High Level)

1. A user enters a ticker (e.g., `AAPL`).  
2. Frontend checks **localStorage**. If no fresh data, it calls `/api/alpha?bundle=1&symbol=AAPL`.  
3. Cloudflare Function fetches from Alpha Vantage, caches the result at the edge for 72 hours, and returns JSON.  
4. Frontend maps statements into a normalized structure and displays them.  
5. Users drag-drop metrics to build ratios or select from presets.  
6. Ratios are calculated dynamically and displayed in a comparison table.

---

## 🚀 Future Improvements

- Switch from Tailwind CDN to a compiled stylesheet for production optimization.
- Add more advanced financial metrics (DuPont decomposition, trend charts).
- Improve CSP headers to better control third-party scripts while keeping functionality.
- Potential integration with another data provider for richer datasets.

---

## ✅ Conclusion

This project gave our team hands-on experience in:

- **Building and deploying a modern web app** with React and serverless functions.  
- **Managing strict API limits** through bundling and caching.  
- **Turning raw data into actionable insights**, bridging our MBA finance curriculum with real-world data engineering.

The Ratios Builder is more than a class assignment — it’s a practical tool we can use to compare companies quickly and visually, while respecting the constraints of real-world APIs.

---

## 📄 License

This project is for educational purposes under the University of Victoria MBA program.  
Not intended for commercial use.
