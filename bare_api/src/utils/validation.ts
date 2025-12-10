import type { PurchaseRequest, ValidatedPurchaseRequest } from "../types/purchase.js";
import { normalizeMilesProgram } from "./miles-programs.js";

/**
 * Valida se uma PurchaseRequest tem os dados necessários para calcular preço
 * Função pura de validação
 */
export const validatePurchaseRequest = (
	request: PurchaseRequest | null,
): ValidatedPurchaseRequest | null => {
	console.log("[DEBUG] validation: Validating purchase request:", request);

	if (!request) {
		console.log("[DEBUG] validation: Request is null, returning null");
		return null;
	}

	console.log("[DEBUG] validation: Checking required fields...", {
		hasQuantity: request.quantity !== undefined,
		hasCpfCount: request.cpfCount !== undefined,
		quantity: request.quantity,
		cpfCount: request.cpfCount,
		airline: request.airline,
	});

	if (
		request.quantity === undefined ||
		request.cpfCount === undefined ||
		request.cpfCount === null ||
		request.quantity === null ||
		request.quantity <= 0 ||
		request.cpfCount <= 0
	) {
		console.log("[DEBUG] validation: Validation failed - missing or invalid fields");
		return null;
	}

	// Normaliza o programa de milhas mencionado
	const milesProgram = normalizeMilesProgram(request.airline ?? null);
	console.log("[DEBUG] validation: Normalized miles program:", {
		original: request.airline,
		normalized: milesProgram,
	});

	const validated = {
		quantity: request.quantity,
		cpfCount: request.cpfCount,
		airline: request.airline ?? undefined,
		milesProgram,
	};
	console.log("[DEBUG] validation: Validation successful:", validated);
	return validated;
};

