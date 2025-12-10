import { getTdjson } from "prebuilt-tdlib";
import { type Client, configure, createClient } from "tdl";
import * as fs from "fs";
import * as path from "path";

// Configure tdl to use prebuilt-tdlib before creating any clients
configure({ tdjson: getTdjson() });

/**
 * Configuração para criar o cliente Telegram
 */
export interface TelegramUserClientConfig {
	apiId: number;
	apiHash: string;
	databaseDirectory?: string;
	filesDirectory?: string;
}

/**
 * Dependências opcionais para customização de handlers
 */
export interface TelegramUserClientDependencies {
	onError?: (error: unknown) => void;
	onUpdate?: (update: unknown) => void;
}

/**
 * Informações do usuário retornadas pelo getMe
 */
export interface TelegramUserInfo {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	usernames?: {
		editable_username?: string;
	};
	phone_number?: string;
}

/**
 * Interface do cliente Telegram criado
 */
export interface TelegramUserClient {
	start: (phone: string) => Promise<TelegramUserInfo>;
	sendMessage: (chatId: number, text: string) => Promise<unknown>;
	close: () => Promise<void>;
}

/**
 * Cria um cliente Telegram usando composição funcional
 * Permite fácil configuração, teste e substituição de dependências
 */
export const createTelegramUserClient = (
	config: TelegramUserClientConfig,
	deps?: TelegramUserClientDependencies,
): TelegramUserClient => {
	const client: Client = createClient({
		apiId: config.apiId,
		apiHash: config.apiHash,
	});

	// Configura handlers de eventos usando dependências injetadas ou defaults
	const onError = deps?.onError ?? console.error;
	const onUpdate = deps?.onUpdate ?? ((update: unknown) => {
		console.log("Received update:", update);
	});

	client.on("error", onError);
	client.on("update", onUpdate);

	return {
	/**
	 * Inicia o cliente e faz login
	 */
	start: async (phone: string) => {
		console.log(`[DEBUG] Starting login process for phone: ${phone}`);
		
		await client.login({
			type: 'user',
			getPhoneNumber: async () => {
				console.log(`[DEBUG] 📱 Providing phone number: ${phone}`);
				return phone;
			},
			getAuthCode: async (retry?: boolean) => {
				if (retry) {
					console.log("[DEBUG] 🔐 Retrying auth code...");
				} else {
					console.log("[DEBUG] 🔐 Waiting for authentication code...");
				}
				
				const authCodeFile = path.join(process.cwd(), '.telegram-auth-code.txt');
				
				// Clear any existing file
				if (fs.existsSync(authCodeFile)) {
					fs.unlinkSync(authCodeFile);
				}
				
				console.log(`[DEBUG] 🔐 Please write the authentication code to: ${authCodeFile}`);
				console.log(`[DEBUG] 🔐 You can do this by running: echo "YOUR_CODE" > ${authCodeFile}`);
				
				return new Promise<string>((resolve) => {
					const checkFile = () => {
						if (fs.existsSync(authCodeFile)) {
							try {
								const code = fs.readFileSync(authCodeFile, 'utf-8').trim();
								if (code) {
									console.log("[DEBUG] 🔐 Code read from file");
									// Clean up the file
									try {
										fs.unlinkSync(authCodeFile);
									} catch (e) {
										// Ignore cleanup errors
									}
									resolve(code);
									return;
								}
							} catch (error) {
								// File might be being written, try again
							}
						}
						// Check again in 500ms
						setTimeout(checkFile, 500);
					};
					
					checkFile();
				});
			},
			getPassword: async (passwordHint: string, retry?: boolean) => {
				if (retry) {
					console.log("[DEBUG] 🔒 Retrying password...");
				} else {
					console.log(`[DEBUG] 🔒 Password required (hint: ${passwordHint})`);
				}
				
				const passwordFile = path.join(process.cwd(), '.telegram-password.txt');
				
				// Clear any existing file
				if (fs.existsSync(passwordFile)) {
					fs.unlinkSync(passwordFile);
				}
				
				console.log(`[DEBUG] 🔒 Please write your password to: ${passwordFile}`);
				console.log(`[DEBUG] 🔒 You can do this by running: echo "YOUR_PASSWORD" > ${passwordFile}`);
				
				return new Promise<string>((resolve) => {
					const checkFile = () => {
						if (fs.existsSync(passwordFile)) {
							try {
								const password = fs.readFileSync(passwordFile, 'utf-8').trim();
								if (password) {
									console.log("[DEBUG] 🔒 Password read from file");
									// Clean up the file
									try {
										fs.unlinkSync(passwordFile);
									} catch (e) {
										// Ignore cleanup errors
									}
									resolve(password);
									return;
								}
							} catch (error) {
								// File might be being written, try again
							}
						}
						// Check again in 500ms
						setTimeout(checkFile, 500);
					};
					
					checkFile();
				});
			},
		});
		
		console.log("[DEBUG] ✅ Login successful, fetching user info...");
		
		const me = await client.invoke({ _: "getMe" }) as TelegramUserInfo;
		console.log("[DEBUG] 📋 User info:", {
			id: me.id,
			firstName: me.first_name,
			lastName: me.last_name,
			username: me.usernames?.editable_username || me.username,
			phoneNumber: me.phone_number,
		});
		
		return me;
	},

		/**
		 * Envia uma mensagem para um chat
		 */
		sendMessage: async (chatId: number, text: string) => {
			return client.invoke({
				_: "sendMessage",
				chat_id: chatId,
				input_message_content: {
					_: 'inputMessageText',
					text: {
						_: 'formattedText',
						text
					}
				},
			});
		},

		/**
		 * Fecha o cliente graciosamente
		 */
		close: async () => {
			await client.close();
		},
	};
};
