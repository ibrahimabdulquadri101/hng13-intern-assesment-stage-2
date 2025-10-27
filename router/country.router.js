import { Router } from "express";
import {
  deleteCountryByName,
  getCountries,
  getCountryByName,
  getStatus,
  getSummaryImage,
  refreshData,
} from "../controller/country.controller.js";

export const countryRoute = Router();

countryRoute.post("/countries/refresh", refreshData);
countryRoute.get("/countries", getCountries);
countryRoute.get("/countries/image", getSummaryImage);
countryRoute.get("/status", getStatus);
countryRoute.get("/countries/:name", getCountryByName);
countryRoute.delete("/countries/:name", deleteCountryByName);
