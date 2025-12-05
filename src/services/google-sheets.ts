import { google } from "googleapis";
import type { PriceTableByCpf } from "../types/price.js";

/**
 * Busca a tabela de preços do Google Sheets
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param range - Range da planilha (ex: "Sheet1!A1:D10")
 * @returns Promise com a tabela de preços no formato PriceTableByCpf
 */
export async function fetchPriceTableFromSheets(
	spreadsheetId: string,
	range: string = "Sheet1!A:C",
): Promise<PriceTableByCpf> {
	const auth = new google.auth.GoogleAuth({
		keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
		scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
	});

	const sheets = google.sheets({ version: "v4", auth });

	console.log("[DEBUG] google-sheets: Fetching data from spreadsheet", {
		spreadsheetId,
		range,
	});

	const response = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range,
	});

	const rows = response.data.values;

	if (!rows || rows.length === 0) {
		throw new Error("Planilha vazia ou não encontrada");
	}

	console.log("[DEBUG] google-sheets: Received rows from spreadsheet", {
		rowCount: rows.length,
	});

	// Primeira linha deve ser cabeçalho: CPF | Quantidade (milhares) | Preço
	// Linhas seguintes são os dados
	const priceTable: PriceTableByCpf = {};

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.length < 3) {
			console.warn(`[DEBUG] google-sheets: Skipping invalid row ${i + 1}:`, row);
			continue;
		}

		const cpfCount = parseInt(row[0]?.toString().trim() || "", 10);
		const quantity = parseInt(row[1]?.toString().trim() || "", 10);
		const price = parseFloat(row[2]?.toString().trim().replace(",", ".") || "");

		if (isNaN(cpfCount) || isNaN(quantity) || isNaN(price)) {
			console.warn(`[DEBUG] google-sheets: Skipping row ${i + 1} with invalid data:`, {
				cpfCount,
				quantity,
				price,
			});
			continue;
		}

		if (!priceTable[cpfCount]) {
			priceTable[cpfCount] = {};
		}

		priceTable[cpfCount][quantity] = price;
	}

	console.log("[DEBUG] google-sheets: Parsed price table", {
		cpfCounts: Object.keys(priceTable),
		totalEntries: Object.values(priceTable).reduce(
			(sum, table) => sum + Object.keys(table).length,
			0,
		),
	});

	return priceTable;
}

