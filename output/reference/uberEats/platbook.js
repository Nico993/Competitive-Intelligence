import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.ubereats.com/ar');
  await page.getByTestId('location-typeahead-input').click();
  await page.getByTestId('location-typeahead-input').press('CapsLock');
  await page.getByTestId('location-typeahead-input').fill('Palermo');
  await page.getByRole('option', { name: 'Palermo Ciudad Autónoma de' }).click();
  await page.getByTestId('search-input').click();
  await page.getByTestId('search-input').fill('cocacola tres litros');
  await page.getByTestId('search-input').press('Enter');
  await page.getByRole('link', { name: 'Ver tienda' }).first().click();
  await page.goto('https://www.ubereats.com/ar/search?pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMlBhbGVybW8lMjIlMkMlMjJyZWZlcmVuY2UlMjIlM0ElMjJDaElKTTdrZWQ1eTF2SlVSYVl6WGxyVVRNV3MlMjIlMkMlMjJyZWZlcmVuY2VUeXBlJTIyJTNBJTIyZ29vZ2xlX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBLTM0LjU3ODA2NTUlMkMlMjJsb25naXR1ZGUlMjIlM0EtNTguNDI2NTMxNyU3RA%3D%3D&q=cocacola%20tres%20litros&sc=SEARCH_BAR&searchType=GLOBAL_SEARCH&vertical=ALL');
  await page.getByRole('link', { name: 'Ver tienda' }).nth(1).click();
  await page.goto('https://www.ubereats.com/ar/search?pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMlBhbGVybW8lMjIlMkMlMjJyZWZlcmVuY2UlMjIlM0ElMjJDaElKTTdrZWQ1eTF2SlVSYVl6WGxyVVRNV3MlMjIlMkMlMjJyZWZlcmVuY2VUeXBlJTIyJTNBJTIyZ29vZ2xlX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBLTM0LjU3ODA2NTUlMkMlMjJsb25naXR1ZGUlMjIlM0EtNTguNDI2NTMxNyU3RA%3D%3D&q=cocacola%20tres%20litros&sc=SEARCH_BAR&searchType=GLOBAL_SEARCH&vertical=ALL');
  await page.getByRole('link', { name: 'Ver tienda' }).nth(2).click();
  await page.getByRole('link', { name: 'Ver tienda' }).nth(3).click();
  await page.goto('https://www.ubereats.com/ar/store/cande-juana-de-arco/BQcbbl_3W7KKcbxqYS2XGg?diningMode=DELIVERY');
});