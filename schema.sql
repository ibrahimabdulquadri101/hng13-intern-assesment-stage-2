CREATE DATABASE country_name;
USE country_name;

CREATE TABLE countries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    capital VARCHAR(255),
    region VARCHAR(255),
    population BIGINT NOT NULL,
    currency_code CHAR(3),
    exchange_rate DECIMAL(10, 4),
    estimated_gdp DECIMAL(20, 2),
    flag_url VARCHAR(512),
    last_refreshed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);