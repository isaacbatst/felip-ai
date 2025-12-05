import { google } from "googleapis";
import type { PriceTableByCpf } from "../types/price.js";

/**
 * Busca a tabela de preços do Google Sheets
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param range - Range da planilha (ex: "Sheet1!A1:C1000" ou apenas "Sheet1")
 * @returns Promise com a tabela de preços no formato PriceTableByCpf
 */
export async function fetchPriceTableFromSheets(
	spreadsheetId: string,
	range?: string,
): Promise<PriceTableByCpf> {
	const auth = new google.auth.GoogleAuth({
		keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
		scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
	});

	const sheets = google.sheets({ version: "v4", auth });

	// Se não foi especificado um range, busca automaticamente a primeira aba
	let sheetName = "Sheet1";
	let rangeToUse: string;

	if (range) {
		// Se o range já contém o nome da aba e colunas, usa diretamente
		if (range.includes("!")) {
			rangeToUse = range;
		} else {
			// Se é apenas o nome da aba, adiciona as colunas A:C
			sheetName = range;
			rangeToUse = `${sheetName}!A:C`;
		}
	} else {
		// Tenta descobrir o nome da primeira aba
		try {
			const spreadsheet = await sheets.spreadsheets.get({
				spreadsheetId,
			});
			const firstSheet = spreadsheet.data.sheets?.[0];
			if (firstSheet?.properties?.title) {
				sheetName = firstSheet.properties.title;
			}
		} catch (error) {
			console.warn("[DEBUG] google-sheets: Could not fetch sheet names, using default 'Sheet1'");
		}
		rangeToUse = `${sheetName}!A:C`;
	}

	console.log("[DEBUG] google-sheets: Fetching data from spreadsheet", {
		spreadsheetId,
		range: rangeToUse,
		sheetName,
	});

	let response;
	try {
		response = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: rangeToUse,
		});
	} catch (error: any) {
		// Se falhar com A:C, tenta sem especificar colunas (pega toda a aba)
		if (error?.code === 400 && rangeToUse.includes("!A:C")) {
			console.log("[DEBUG] google-sheets: Range A:C failed, trying full sheet");
			rangeToUse = sheetName;
			response = await sheets.spreadsheets.values.get({
				spreadsheetId,
				range: rangeToUse,
			});
		} else {
			throw error;
		}
	}

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

