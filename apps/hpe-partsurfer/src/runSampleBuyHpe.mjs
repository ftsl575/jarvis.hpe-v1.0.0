import process from 'node:process';
import { providerBuyHpe } from './providerBuyHpe.js';

async function main() {
  const [sku] = process.argv.slice(2);

  if (!sku) {
    console.error('Usage: node --experimental-vm-modules .\\src\\runSampleBuyHpe.mjs <SKU>');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await providerBuyHpe(sku, { live: true });
    console.log(JSON.stringify(result ?? null, null, 2));
  } catch (error) {
    const message = error?.message || String(error);
    console.error(`Failed to fetch SKU ${sku}: ${message}`);
    if (error?.code) {
      console.error(`Error code: ${error.code}`);
    }
    process.exitCode = 1;
  }
}

await main();
