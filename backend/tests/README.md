# Testing Guide

## Purpose
Provide the team with a clear, repeatable approach to testing that can scale as the project grows. This guide outlines the critical user journey, acceptance criteria, test methodology, data strategy, how to run tests, and how to add new tests.

## Critical User Journey

**Narrative**  
A fan opens the site, selects a home team and season, selects an away team and season, requests a prediction, and sees a probability with supporting details.

**Steps**  
1. Load the site UI  
2. Fetch the list of teams from the API  
3. Select home team and season  
4. Select away team and season  
5. Submit to the API  
6. View the returned probability and details  
7. Handle any validation or data errors gracefully  

**Acceptance Criteria**  
1. Teams endpoint returns a sorted list of unique NBA team names  
2. Seasons endpoint requires a team and returns the seasons for that team in descending order  
3. Predict endpoint returns a probability between 0 and 1 and includes the input values echoed back  
4. If the same team and same season are selected, the API returns a clear validation error  
5. Network or data errors result in a helpful message in the UI, not a blank screen  

## Test Methodology

**Testing Pyramid**  
1. Unit tests  
2. Integration tests  
3. End-to-end tests  

**Risk-Based Focus**  
The most critical areas to protect are:  
- CSV loading logic  
- Rating selection  
- Probability calculations  
- Predict API contract  

**Contracts and Invariants**  
1. Probability is always in the range [0, 1]  
2. Probability increases as rating difference increases  
3. Routes always return the documented JSON fields and error structures  

## Test Suite Layout

**Folder Structure**  
```
backend  
  • app  
  • services  
  • tests  
      • unit  
      • integration
```

**Unit Tests Target**  
- `services.ratings`  
  - CSV path resolution  
  - YEAR derivation from GAME_DATE  
  - Latest rating selection within a season  
  - Probability maths: range and monotonicity  

**Integration Tests Target**  
- Flask routes tested through the test client  
  - `GET /health` returns ok  
  - `GET /api/teams` returns sorted unique names  
  - `GET /api/seasons` validates the team param  
  - `POST /api/predict` returns the documented JSON and validates same team plus same season  

**End-to-End Tests Target**  
- Frontend user flow with Playwright or Cypress once staging is deployed (Vercel and Railway)  
  - Happy path: page load → probability displayed  
  - Error path: API returns validation or not found error  

## Data Strategy for Tests

- Keep fixtures tiny and self-contained  
- Generate small CSVs inside tests using `tmp_path`  
- Point `RATINGS_CSV` to the temp file with `monkeypatch`  
- Do not read the full dataset in unit or integration tests  

**Caching Note**  
- `services.ratings.load_full` uses an in-memory cache  
- Unit tests must call `load_full.cache_clear()` before asserting  
- Integration tests rely on the first request after setting `RATINGS_CSV` to prime the cache  

## Running the Tests

**Backend Unit and Integration Tests**  
From the `backend` folder run:  
```
pytest
```

**End-to-End Tests**  
Run via Playwright or Cypress once staging environment is live.  
```
npx playwright test
# or
npx cypress open
```