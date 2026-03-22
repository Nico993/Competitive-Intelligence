import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.rappi.com.ar/');
  await page.getByRole('button', { name: 'Ingresar mi ubicación' }).click();
  await page.getByRole('textbox', { name: 'Escribí la dirección de' }).press('CapsLock');
  await page.getByRole('textbox', { name: 'Escribí la dirección de' }).fill('Cordoba');
  await page.getByRole('button', { name: 'Córdoba', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar Dirección' }).click();
  await page.getByRole('button', { name: 'Guardar dirección' }).click();
  await page.getByRole('searchbox', { name: 'Comida, restaurantes, tiendas' }).click();
  await page.getByRole('searchbox', { name: 'Comida, restaurantes, tiendas' }).press('CapsLock');
  await page.getByRole('searchbox', { name: 'Comida, restaurantes, tiendas' }).fill('Cocacola tres litros');
  await page.getByRole('searchbox', { name: 'Comida, restaurantes, tiendas' }).press('Enter');
});