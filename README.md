# AI Auto-Dashboard Builder

An AI-powered analytics and dashboard platform that can ingest data from multiple source types, profile the data, understand its structure, recommend KPIs, and auto-build dashboards from plain English prompts.

## Features

- **Natural Language Dashboards** — Type a question like "Show unresolved tickets by priority" and get a complete dashboard
- **Multiple Data Sources** — Support for internal database, CSV, Excel, JSON files, and external REST APIs
- **Auto Data Profiling** — Automatic detection of field types, measures, dates, categories, and identifiers
- **KPI Generation** — Contextual KPI cards based on data entity and query results
- **Chart Builder** — Chart.js-powered visualizations (bar, line, pie, doughnut, table)
- **Dashboard History** — Save and revisit generated dashboards
- **Source Explorer** — Preview data, view schema, and profile summaries
- **Demo Data** — Built-in realistic demo data with departments, employees, projects, productivity records, and tickets

## Supported Data Sources

| Source Type | Description |
|---|---|
| Database | Internal SQLite database with demo data |
| CSV | Upload .csv files |
| Excel | Upload .xlsx files (first sheet) |
| JSON | Upload .json files (array of objects) |
| API | External REST API endpoint returning JSON |

## Tech Stack

- **Backend:** Node.js, Express.js
- **Views:** EJS templates with express-ejs-layouts
- **UI:** Bootstrap 5, Bootstrap Icons
- **Charts:** Chart.js 4
- **ORM:** Sequelize 6
- **Database:** SQLite (development), MySQL (production-ready)
- **File Upload:** Multer
- **File Parsing:** xlsx, csv-parse
- **HTTP Client:** Axios
- **Session:** express-session, connect-flash

## Why SQLite First?

SQLite is used as the default local development database because:
- Zero configuration — no external database server needed
- Single file storage (`./data/app.db`)
- Perfect for prototyping, demos, and local development
- Full SQL support via Sequelize ORM

## Migrating to MySQL

The application is built with Sequelize ORM, making database migration straightforward:

1. Install MySQL and create a database:
   ```sql
   CREATE DATABASE ai_auto_dashboard_builder;
   ```

2. Update your `.env` file:
   ```
   DB_CLIENT=mysql
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=ai_auto_dashboard_builder
   DB_USER=root
   DB_PASSWORD=your_password
   ```

3. Run migrations:
   ```bash
   npx sequelize-cli db:migrate
   ```

4. Seed data:
   ```bash
   npx sequelize-cli db:seed:all
   ```

No code changes are needed — the ORM handles dialect differences.

## Installation

```bash
# Clone or navigate to the project
cd ai-auto-dashboard-builder

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run database migrations
npx sequelize-cli db:migrate

# Seed demo data
npx sequelize-cli db:seed:all

# Start the application
npm start
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment |
| `DB_CLIENT` | sqlite | Database dialect (sqlite or mysql) |
| `DB_HOST` | localhost | MySQL host |
| `DB_PORT` | 3306 | MySQL port |
| `DB_NAME` | ai_auto_dashboard_builder | MySQL database name |
| `DB_USER` | root | MySQL user |
| `DB_PASSWORD` | | MySQL password |
| `SQLITE_STORAGE` | ./data/app.db | SQLite file path |
| `SESSION_SECRET` | change_me | Session secret |
| `UPLOAD_DIR` | ./uploads | File upload directory |
| `MAX_UPLOAD_MB` | 10 | Maximum upload file size in MB |
| `OPENAI_API_KEY` | | Optional OpenAI key for future AI parsing |

## Commands

```bash
# Install dependencies
npm install

# Run migrations
npx sequelize-cli db:migrate

# Seed demo data
npx sequelize-cli db:seed:all

# Undo all migrations
npx sequelize-cli db:migrate:undo:all

# Reset database (undo + migrate + seed)
npm run db:reset

# Start server
npm start

# Full setup (install + migrate + seed)
npm run setup
```

## File Upload Notes

- Supported formats: `.csv`, `.xlsx`, `.json`
- Maximum file size: 10 MB (configurable via `MAX_UPLOAD_MB`)
- Uploaded files are stored in the `./uploads/` directory
- Preview is limited to first 50 rows for performance
- File type and MIME type are validated on upload

## API Source Notes

- Only `GET` requests are supported in V1
- The API endpoint must return JSON
- If the response is a nested object, the system attempts to find the first array property
- Optional headers (e.g., Authorization) and query params can be provided as JSON
- A 15-second timeout is applied to all API requests

## Project Structure

```
├── config/
│   ├── app.js          # Application configuration
│   ├── db.js           # Database configuration (SQLite/MySQL)
│   └── multer.js       # File upload configuration
├── controllers/
│   ├── homeController.js
│   ├── dashboardController.js
│   ├── historyController.js
│   └── sourceController.js
├── migrations/
├── models/
│   ├── index.js        # Sequelize initialization
│   ├── department.js
│   ├── employee.js
│   ├── project.js
│   ├── productivityRecord.js
│   ├── ticket.js
│   ├── promptHistory.js
│   ├── savedDashboard.js
│   ├── dataSource.js
│   └── dataSourceSchema.js
├── routes/
│   └── web.js
├── seeders/
├── services/
│   ├── promptParserService.js    # NL prompt -> structured request
│   ├── dashboardService.js       # Orchestrates dashboard generation
│   ├── queryService.js           # Safe data querying
│   ├── chartService.js           # Chart.js config builder
│   ├── kpiService.js             # KPI card generator
│   ├── dateFilterService.js      # Date phrase interpreter
│   ├── sourceIngestionService.js # Data source ingestion coordinator
│   ├── fileParserService.js      # CSV/Excel/JSON file parser
│   ├── apiIngestionService.js    # External API fetcher
│   └── schemaProfilerService.js  # Schema/type inference
├── utils/
│   ├── constants.js
│   ├── helpers.js
│   └── dataFlattener.js
├── views/
│   ├── layouts/main.ejs
│   ├── partials/
│   ├── home.ejs
│   ├── dashboard-result.ejs
│   ├── dashboard-detail.ejs
│   ├── dashboard-history.ejs
│   ├── sources.ejs
│   ├── source-form.ejs
│   └── source-detail.ejs
├── public/
│   ├── css/style.css
│   └── js/dashboard.js
├── data/              # SQLite database file
├── uploads/           # Uploaded files
├── server.js
├── package.json
├── .env.example
└── README.md
```

## Future Enhancements

- **OpenAI Integration** — Replace rule-based prompt parser with GPT-powered interpretation
- **PostgreSQL Support** — Add PostgreSQL dialect support
- **Real-time Dashboards** — WebSocket-based live updates
- **User Authentication** — Multi-user support with roles
- **Scheduled Syncs** — Auto-refresh API and database sources
- **Export** — PDF and image export of dashboards
- **Custom SQL** — Safe SQL editor for advanced users

## Sample Prompts

Try these prompts with the demo data:

- "Show me employees with low productivity this month"
- "Compare productivity by department"
- "Show unresolved tickets by priority"
- "Top 10 projects by budget"
- "Show average hours logged by department"
- "Show active projects by department"
- "Show monthly ticket trend"
- "Project count by status"
- "Show inactive employees by department"
- "Show highest budget projects"

## License

MIT
