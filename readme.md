# Idea
- Todo anuncio de lancamento possui N palavras em comum
    Palavras como "launching soon", "launching tomorrow" -- assim filtrando casos que abrangem muitos casos falso-positivos filtrando somente por "launching:
- Entao, iremos analisar o contexto do tweet pra compreender se envolve crypto
- Caso envolva, o perfil sera monitorado ao criarmos uma nova stream-rule from:project_handler, e toda informacao pertinente obtida desse tweet já sera pushada pro db, portanto uma entrada pra ele será criada
- Novos tweets desse perfil serao prontamente analisados e irao preenchendo a entrada desse launch aos poucos. Visto que ele já teria caido no radar e tudo dele seria enumerado pela gente
- Caso tenha limite maximo de rules por stream: as contas sendo monitoradas (stream-rule com from:) devem ser guardados no nosso db, sendo desativados automaticamente caso ultrapasse o periodo de 15 dias

- (Extra): O conteudo de imagens deve ser parseado com tesseract e atribuido como contexto

# Common announcement words
"launching tomorrow"
"launching soon"

"launching on pump.fun"
"launching on ethereum" OR "launching on #ethereum"
"launching on solana" OR "launching on #solana" OR "launching on sol" OR "launching on #sol"
"launching on base" OR "launching on #base"
"launching on binance" OR "launching on #binance" OR "launching on bsc" OR "launching on #bsc"

"built on ethereum" or "built on #ethereum"
"built on solana" or "built on #solana"
"built on base" or "built on #base"
"built on binance" OR "built on bsc" OR "built on #binance" OR "built on #bsc"

# TwitterApi.io
"This means you should batch aggressively. If you're polling every minute and typically getting 1–3 tweets per call, you're paying per-call minimums constantly. Better to poll every 5–10 minutes and get 5–15 tweets per batch — you pay proportionally but waste zero credits on minimums.
It also means the Profiles (18 credits) and Followers (15 credits) fields are nearly free to request alongside tweets. For LaunchRadar's progressive enrichment pipeline, you should always request the author profile in the same call as the tweet — you get the bio, website, follower count for basically the same price, which directly feeds your structured data extraction without a second API call."

# Claude
https://claude.ai/chat/da31776f-47e0-4a5c-babd-482d34955800