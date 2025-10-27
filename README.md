# **Project Documentation: Country Currency & Exchange Caching API**

## **An Overview of the Cached Economic Data Service**

This document serves as the primary technical and procedural guide for the **Country Currency & Exchange API**, a robust backend service designed to aggregate, process, and efficiently cache global country and currency data. The core objective of this application is to mitigate reliance on frequent calls to external APIs by providing a high-availability, consistent data source via a MySQL database cache. By integrating disparate data points—country demographics, currency codes, and exchange rates—the service computes a derived economic metric, the "Estimated GDP," which is updated periodically upon explicit request. The architecture is built upon the Node.js ecosystem, utilizing the Express framework for RESTful routing and the mysql2 package for reliable database interaction.

## **Technical Architecture and Setup**

The application is structured to ensure portability and clarity, separating concerns into routing, controller logic, external API access, and database configuration. Essential dependencies include **Express**, **Axios** (for external fetching), **mysql2** (for database connectivity), **dotenv** (for configuration management), and **sharp** (for dynamic image generation).

To initialize the project locally, developers must first install dependencies via the package manager: npm install.

### **Environment Configuration**

Crucially, the service relies on environment variables for secure and flexible configuration, managed through the .env files. Prior to execution, these variables must be defined.

| Variable | Description | Example (Local) |
| :---- | :---- | :---- |
| PORT | The port the Express server will listen on. | 3000 |
| DB\_HOST | Database host address. | 127.0.0.1 |
| DB\_PORT | Database port (default MySQL is 3306). | 3006 |
| DB\_USER | Database username. | root |
| DB\_PASSWORD | Database password. | password |
| DB | The name of the MySQL database. | country\_name |

### **Database Initialization**

The persistence layer is a MySQL database. The required schema, defined in schema.sql, must be executed on the target database instance before running the application. This script creates the country\_name database and the countries table, ensuring proper indexing and constraints, notably the name column being unique to facilitate the update-or-insert (upsert) logic.

To run the application locally, assuming MySQL is running and the schema is applied, the execution command is typically: node app.js.

## **Core Functionality and Endpoints**

The API exposes six primary endpoints, each serving a specific data lifecycle or retrieval purpose.

### **Data Refresh and Caching (POST /countries/refresh)**

This is the control center of the API. Upon receiving a POST request, the application initiates a critical sequence: fetching global country data (restcountries.com) and current USD exchange rates (open.er-api.com). This process involves complex data transformation: calculating a unique **Estimated GDP** by applying a fresh random multiplier (1000–2000) to the population divided by the exchange rate, and implementing robust handling for missing currencies or rates. This entire operation is wrapped in a database transaction to guarantee data integrity; if any step fails (including external API failure, which returns a 503 Service Unavailable), existing cache data remains untouched. Upon successful commitment, the cache is updated, and a summary image (cache/summary.png) detailing the total count and top GDP countries is generated.

### **Data Retrieval and CRUD Operations**

The remaining endpoints provide standard RESTful access to the cached data:

* **GET /countries**: Retrieves all cached country records. This endpoint is highly flexible, supporting filtering by ?region= or ?currency= and advanced sorting via ?sort=gdp\_desc (or asc). Data is sanitized and returned in a consistent JSON format.  
* **GET /countries/:name**: Fetches a single country record using its name as a path parameter, returning a 404 Not Found if the record does not exist.  
* **DELETE /countries/:name**: Removes a country record from the cache, strictly adhering to the 404 Not Found response if the country is not present.  
* **GET /status**: Provides critical operational metadata, including the total\_countries currently in the cache and the last\_refreshed\_at timestamp.  
* **GET /countries/image**: Serves the binary data of the dynamically generated summary image, which visualizes the current cache status.

## **Error Handling and Compliance**

The API strictly adheres to the provided error handling specifications, ensuring predictable and informative responses across all scenarios.

| Status Code | Error Type | JSON Response Format |
| :---- | :---- | :---- |
| **400 Bad Request** | Indicates validation failure (e.g., missing required fields in data intended for modification). | { "error": "Validation failed", "details": { "field": "is required" } } |
| **404 Not Found** | Resource cannot be found (e.g., trying to fetch or delete a non-existent country). | { "error": "Country not found" } |
| **503 Service Unavailable** | The refresh failed due to the unavailability of an external data source. | { "error": "External data source unavailable" } |
| **500 Internal Server Error** | Generic server-side failure. | { "error": "Internal server error" } |

This robust architecture ensures that the Country Currency & Exchange API delivers high performance, data accuracy, and operational reliability, serving as a clean, decoupled data layer for any client application.