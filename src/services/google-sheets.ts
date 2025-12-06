import { google } from "googleapis";
import type { PriceTableV2 } from "../types/price.js";

/**
 * Resultado da busca na planilha v2 incluindo tabela de preços v2 e milhas disponíveis
 */
export interface PriceTableResultV2 {
	priceTable: PriceTableV2;
	availableMiles: number | null;
}

/**
 * Busca a tabela de preços v2 do Google Sheets
 * Formato v2: apenas Quantidade e Preço (todos os registros são para 1 CPF)
 * @param sheets - Cliente do Google Sheets API
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param range - Range a ser usado na busca
 * @param sheetName - Nome da aba
 * @returns Promise com a tabela de preços v2
 */
async function fetchPriceTable(
	sheets: ReturnType<typeof google.sheets>,
	spreadsheetId: string,
	range: string,
	sheetName: string,
): Promise<PriceTableV2> {
	// Constrói o range completo combinando o nome da aba com o range
	const fullRange = `${sheetName}${range}`;
	console.log("[DEBUG] google-sheets-v2: Fetching price table from spreadsheet", {
		spreadsheetId,
		range: fullRange,
		sheetName,
	});

	let response: any;
	try {
		response = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: fullRange,
		});
	} catch (error: any) {
		// Se falhar com A:B, tenta sem especificar colunas (pega toda a aba)
		if (error?.code === 400 && range.includes("!A:B")) {
			console.log("[DEBUG] google-sheets-v2: Range A:B failed, trying full sheet");
			const fallbackRange = sheetName;
			response = await sheets.spreadsheets.values.get({
				spreadsheetId,
				range: fallbackRange,
			});
		} else {
			throw error;
		}
	}

	const rows = response.data.values;

	if (!rows || rows.length === 0) {
		throw new Error("Planilha v2 vazia ou não encontrada");
	}

	console.log("[DEBUG] google-sheets-v2: Received rows from spreadsheet", {
		rowCount: rows.length,
	});

	// Primeira linha deve ser cabeçalho: Quantidade (milhares) | Preço
	// Linhas seguintes são os dados (todos para 1 CPF)
	const priceTable: PriceTableV2 = {};

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.length < 2) {
			console.warn(`[DEBUG] google-sheets-v2: Skipping invalid row ${i + 1}:`, row);
			continue;
		}

		const quantity = parseInt(row[0]?.toString().trim() || "", 10);
		const price = parseFloat(row[1]?.toString().trim().replace(",", ".") || "");

		if (isNaN(quantity) || isNaN(price)) {
			console.warn(`[DEBUG] google-sheets-v2: Skipping row ${i + 1} with invalid data:`, {
				quantity,
				price,
			});
			continue;
		}

		priceTable[quantity] = price;
	}

	console.log("[DEBUG] google-sheets-v2: Parsed price table v2", {
		totalEntries: Object.keys(priceTable).length,
		quantities: Object.keys(priceTable),
	});

	return priceTable;
}

/**
 * Busca a quantidade de milhas disponíveis na célula E2
 * @param sheets - Cliente do Google Sheets API
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param sheetName - Nome da aba
 * @returns Promise com a quantidade de milhas disponíveis ou null
 */
async function fetchAvailableMiles(
	sheets: ReturnType<typeof google.sheets>,
	spreadsheetId: string,
	sheetName: string,
): Promise<number | null> {
	try {
		const e2Response = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: `${sheetName}!E2`,
		});

		const e2Value = e2Response.data.values?.[0]?.[0];
		if (e2Value !== undefined && e2Value !== null && e2Value !== "") {
			const parsedValue = parseFloat(e2Value.toString().trim().replace(",", "."));
			if (!isNaN(parsedValue) && parsedValue >= 0) {
				console.log("[DEBUG] google-sheets-v2: Available miles found in E2:", parsedValue);
				return parsedValue;
			} else {
				console.warn("[DEBUG] google-sheets-v2: Invalid value in E2:", e2Value);
			}
		} else {
			console.warn("[DEBUG] google-sheets-v2: E2 cell is empty or not found");
		}
	} catch (error) {
		console.warn("[DEBUG] google-sheets-v2: Error reading E2 cell:", error);
	}

	return null;
}

/**
 * Busca a tabela de preços v2 do Google Sheets e a quantidade de milhas disponíveis (célula E2)
 * Formato v2: apenas Quantidade e Preço (todos os registros são para 1 CPF)
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param keyFile - Caminho para o arquivo de chave da service account
 * @param range - Range da planilha (ex: "Sheet2!A1:B1000" ou apenas "Sheet2")
 * @returns Promise com a tabela de preços v2 e milhas disponíveis
 */
export async function fetchPriceTableV2FromSheets(
	spreadsheetId: string,
	keyFile: string,
): Promise<PriceTableResultV2> {
	const auth = new google.auth.GoogleAuth({
		keyFile,
		scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
	});

	const sheets = google.sheets({ version: "v4", auth });
	const range = "!A:B";
	const sheetName = "Sheet2";
	// Executa as buscas em paralelo
	const [priceTable, availableMiles] = await Promise.all([
		fetchPriceTable(sheets, spreadsheetId, range, sheetName),
		fetchAvailableMiles(sheets, spreadsheetId, sheetName),
	]);

	return {
		priceTable,
		availableMiles,
	};
}

