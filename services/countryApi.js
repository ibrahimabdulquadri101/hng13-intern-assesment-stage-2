import axios from "axios";

export const fetchData = async () => {
  try {
    const countriesUrl =
      "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies";
    const countriesResponse = await axios.get(countriesUrl);
    const countriesData = countriesResponse.data;
    const ratesUrl = "https://open.er-api.com/v6/latest/USD";
    const ratesResponse = await axios.get(ratesUrl);
    const exchangeRates = ratesResponse.data.rates;

    return { countriesData, exchangeRates };
  } catch (error) {
    console.log(error);
  }
};
