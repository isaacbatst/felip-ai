import { google } from "googleapis";
import type { PriceTableV2 } from "../types/price.js";
import {
	BRAZILIAN_MILES_PROGRAMS,
	type MilesProgram,
} from "../utils/miles-programs.js";

/**
 * Resultado da busca na planilha v2 incluindo tabela de preços v2 e milhas disponíveis por programa
 */
export interface PriceTableResultV2 {
	priceTable: PriceTableV2;
	availableMiles: Record<MilesProgram, number | null>;
	/**
	 * Preço máximo customizado opcional lido da célula C2
	 * Quando fornecido, o preço calculado não pode exceder este valor
	 */
	customMaxPrice?: number;
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
	console.log(
		"[DEBUG] google-sheets-v2: Fetching price table from spreadsheet",
		{
			spreadsheetId,
			range: fullRange,
			sheetName,
		},
	);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let response: any;
	try {
		response = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: fullRange,
		});
	} catch (error: unknown) {
		// Se falhar com A:B, tenta sem especificar colunas (pega toda a aba)
		if ((error as { code?: number })?.code === 400 && range.includes("!A:B")) {
			console.log(
				"[DEBUG] google-sheets-v2: Range A:B failed, trying full sheet",
			);
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
			console.warn(
				`[DEBUG] google-sheets-v2: Skipping invalid row ${i + 1}:`,
				row,
			);
			continue;
		}

		const quantity = parseInt(row[0]?.toString().trim() || "", 10);
		const price = parseFloat(row[1]?.toString().trim().replace(",", ".") || "");

		if (Number.isNaN(quantity) || Number.isNaN(price)) {
			console.warn(
				`[DEBUG] google-sheets-v2: Skipping row ${i + 1} with invalid data:`,
				{
					quantity,
					price,
				},
			);
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
 * Busca o preço máximo customizado da célula C2
 * @param sheets - Cliente do Google Sheets API
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param sheetName - Nome da aba
 * @returns Promise com o preço máximo customizado ou undefined se não encontrado/inválido
 */
async function fetchCustomMaxPrice(
	sheets: ReturnType<typeof google.sheets>,
	spreadsheetId: string,
	sheetName: string,
): Promise<number | undefined> {
	try {
		const cellRange = `${sheetName}!C2`;
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: cellRange,
		});

		const rows = response.data.values;
		if (!rows || rows.length === 0 || !rows[0] || rows[0].length === 0) {
			console.log(
				"[DEBUG] google-sheets-v2: C2 cell is empty, no customMaxPrice",
			);
			return undefined;
		}

		const cellValue = rows[0][0]?.toString().trim();
		if (!cellValue) {
			console.log(
				"[DEBUG] google-sheets-v2: C2 cell is empty, no customMaxPrice",
			);
			return undefined;
		}

		const parsedValue = parseFloat(cellValue.replace(",", "."));
		if (Number.isNaN(parsedValue) || parsedValue <= 0) {
			console.log(
				"[DEBUG] google-sheets-v2: C2 cell contains invalid value, ignoring customMaxPrice",
				{ cellValue, parsedValue },
			);
			return undefined;
		}

		console.log(
			"[DEBUG] google-sheets-v2: Custom max price found in C2:",
			parsedValue,
		);
		return parsedValue;
	} catch (error) {
		console.warn(
			"[DEBUG] google-sheets-v2: Error reading C2 cell for customMaxPrice:",
			error,
		);
		return undefined;
	}
}

/**
 * Busca milhas disponíveis para todos os programas em uma única requisição
 * Estrutura esperada na planilha: Tabela nas colunas D e E
 * - Coluna D: nome do programa
 * - Coluna E: milhas disponíveis
 *
 * @param sheets - Cliente do Google Sheets API
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param sheetName - Nome da aba
 * @returns Promise com objeto contendo milhas disponíveis por programa
 */
async function fetchAllAvailableMiles(
	sheets: ReturnType<typeof google.sheets>,
	spreadsheetId: string,
	sheetName: string,
): Promise<Record<MilesProgram, number | null>> {
	const availableMiles: Record<MilesProgram, number | null> = {} as Record<
		MilesProgram,
		number | null
	>;

	// Inicializa todos os programas com null
	for (const program of BRAZILIAN_MILES_PROGRAMS) {
		availableMiles[program] = null;
	}

	try {
		// Busca da tabela de programas (coluna D: programa, coluna E: milhas)
		const programsRange = `${sheetName}!D:E`;
		const programsResponse = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: programsRange,
		});

		const rows = programsResponse.data.values;
		if (rows && rows.length > 0) {
			// Parseia todos os programas da tabela de uma vez
			for (const row of rows) {
				if (!row || row.length < 2) {
					continue;
				}
				const programName = row[0]?.toString().trim().toUpperCase();
				const milesValue = row[1]?.toString().trim();
				if (!programName || !milesValue) {
					continue;
				}

				// Tenta encontrar o programa correspondente
				for (const program of BRAZILIAN_MILES_PROGRAMS) {
					if (programName === program) {
						const parsedValue = parseFloat(milesValue.replace(",", "."));
						if (!Number.isNaN(parsedValue) && parsedValue >= 0) {
							availableMiles[program] = parsedValue;
							console.log(
								`[DEBUG] google-sheets-v2: Available miles found for ${program} in table:`,
								parsedValue,
							);
							break; // Encontrou o programa, pode sair do loop interno
						} else {
							console.log(
								`[DEBUG] google-sheets-v2: Parsed miles value is NaN or negative for ${program}:`,
								{
									program,
									rawValue: milesValue,
									parsedValue,
								},
							);
						}
					}
				}
			}
		}
	} catch (error) {
		console.warn(
			`[DEBUG] google-sheets-v2: Error reading programs table:`,
			error,
		);
	}

	return availableMiles;
}

/**
 * Busca a tabela de preços v2 do Google Sheets e a quantidade de milhas disponíveis
 * Formato v2: apenas Quantidade e Preço (todos os registros são para 1 CPF)
 * Milhas disponíveis são buscadas da tabela nas colunas D (programa) e E (milhas)
 *
 * @param spreadsheetId - ID da planilha do Google Sheets
 * @param keyFile - Caminho para o arquivo de chave da service account
 * @returns Promise com a tabela de preços v2 e milhas disponíveis por programa
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
	const sheetName = "Sheet1";
	// Executa as buscas em paralelo
	const [priceTable, availableMiles, customMaxPrice] = await Promise.all([
		fetchPriceTable(sheets, spreadsheetId, range, sheetName),
		fetchAllAvailableMiles(sheets, spreadsheetId, sheetName),
		fetchCustomMaxPrice(sheets, spreadsheetId, sheetName),
	]);

	return {
		priceTable,
		availableMiles,
		customMaxPrice,
	};
}
