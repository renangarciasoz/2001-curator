-- CreateEnum
CREATE TYPE "Curador" AS ENUM ('SONIA', 'MIRELLA', 'AMBAS', 'DEMO');

-- CreateEnum
CREATE TYPE "RegistroComercial" AS ENUM ('COMERCIAL', 'CABECA', 'AMBOS');

-- CreateEnum
CREATE TYPE "CategoriaAcervo" AS ENUM ('HISTORIA_DA_EMPRESA', 'METODO_DE_TREINAMENTO', 'CURADORIA', 'CLIPPING', 'ENTREVISTAS', 'REVISTAS_2001', 'CURSOS', 'LISTA_OMO', 'ATENDIMENTO_E_CASOS_REAIS', 'TEXTOS_DA_SONIA', 'PREMIACOES', 'MARKETING_E_EVENTOS');

-- CreateEnum
CREATE TYPE "TipoConexao" AS ENUM ('PORTA_DE_ENTRADA', 'SE_GOSTOU_DE', 'ANTES_DE_VER', 'LANCAMENTO_PARA_ACERVO', 'ACERVO_PARA_LANCAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoLista" AS ENUM ('TOP_DO_MES', 'TEMATICO', 'EVENTO', 'OMO_HISTORICA');

-- CreateEnum
CREATE TYPE "Consenso" AS ENUM ('ACORDO', 'DIVERGENCIA', 'SO_UMA_AVALIOU');

-- CreateEnum
CREATE TYPE "Qualidade" AS ENUM ('ABSORVE', 'DESCARTA', 'REVISAR');

-- CreateEnum
CREATE TYPE "Confianca" AS ENUM ('ALTA', 'NORMAL');

-- CreateEnum
CREATE TYPE "FonteFactual" AS ENUM ('TMDB', 'FIXTURE_DEV');

-- CreateEnum
CREATE TYPE "FonteCuratorial" AS ENUM ('CURADORIA_2001', 'DEMO');

-- CreateEnum
CREATE TYPE "PapelNaConversa" AS ENUM ('RECOMENDADO_PELA_IA', 'CORRIGIDO_PELA_CURADORA');

-- CreateEnum
CREATE TYPE "AutorDaMensagem" AS ENUM ('CURADORA', 'INDICADOR');

-- CreateTable
CREATE TABLE "filme" (
    "id" UUID NOT NULL,
    "tmdb_id" INTEGER,
    "titulo" TEXT NOT NULL,
    "titulo_original" TEXT,
    "ano" INTEGER,
    "diretor" TEXT,
    "pais" TEXT,
    "sinopse_factual" TEXT,
    "poster_path" TEXT,
    "tom_emocional" TEXT,
    "o_que_provoca" TEXT,
    "registro_comercial" "RegistroComercial",
    "notas_curatoriais" TEXT,
    "contexto_historico" TEXT,
    "categoria_acervo" "CategoriaAcervo",
    "avaliado_por" "Curador"[],
    "fonte_factual" "FonteFactual" NOT NULL,
    "fonte_curatorial" "FonteCuratorial",
    "indexado_em" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "filme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conexao" (
    "id" UUID NOT NULL,
    "filme_origem_id" UUID NOT NULL,
    "filme_destino_id" UUID NOT NULL,
    "tipo" "TipoConexao" NOT NULL,
    "ponte_por" TEXT NOT NULL,
    "porque" TEXT NOT NULL,
    "curador" "Curador" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conexao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "curador" "Curador" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada_filme" (
    "jornada_id" UUID NOT NULL,
    "filme_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nota_do_porque" TEXT NOT NULL,

    CONSTRAINT "jornada_filme_pkey" PRIMARY KEY ("jornada_id","filme_id")
);

-- CreateTable
CREATE TABLE "lista_editorial" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "tipo" "TipoLista" NOT NULL,
    "curador" "Curador" NOT NULL,
    "publicada_em" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_editorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_editorial_filme" (
    "lista_id" UUID NOT NULL,
    "filme_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "linha_de_curadoria" TEXT NOT NULL,

    CONSTRAINT "lista_editorial_filme_pkey" PRIMARY KEY ("lista_id","filme_id")
);

-- CreateTable
CREATE TABLE "sessao" (
    "id" UUID NOT NULL,
    "perfil_id" UUID,
    "curador" "Curador" NOT NULL,
    "titulo" TEXT,
    "encerrada_em" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem" (
    "id" UUID NOT NULL,
    "sessao_id" UUID NOT NULL,
    "autor" "AutorDaMensagem" NOT NULL,
    "blocos" JSONB NOT NULL,
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversa" (
    "id" UUID NOT NULL,
    "sessao_id" UUID,
    "perfil_id" UUID,
    "pedido_do_usuario" TEXT NOT NULL,
    "perguntas_da_ia" JSONB NOT NULL,
    "recomendacao_da_ia" TEXT NOT NULL,
    "correcao" TEXT,
    "porque_da_correcao" TEXT,
    "avaliado_por" "Curador",
    "nota_da_divergencia" TEXT,
    "consenso" "Consenso",
    "qualidade" "Qualidade",
    "confianca" "Confianca",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversa_filme" (
    "conversa_id" UUID NOT NULL,
    "filme_id" UUID NOT NULL,
    "papel" "PapelNaConversa" NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "conversa_filme_pkey" PRIMARY KEY ("conversa_id","filme_id","papel")
);

-- CreateTable
CREATE TABLE "perfil" (
    "id" UUID NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "gostos" TEXT[],
    "evita" TEXT[],
    "repertorio" TEXT,
    "momento_de_vida" TEXT,
    "nivel" TEXT NOT NULL DEFAULT 'padrao',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_filme_assistido" (
    "perfil_id" UUID NOT NULL,
    "filme_id" UUID NOT NULL,
    "nota" TEXT,
    "registrado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_filme_assistido_pkey" PRIMARY KEY ("perfil_id","filme_id")
);

-- CreateTable
CREATE TABLE "perfil_jornada" (
    "perfil_id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "iniciada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_em" TIMESTAMPTZ(6),

    CONSTRAINT "perfil_jornada_pkey" PRIMARY KEY ("perfil_id","jornada_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filme_tmdb_id_key" ON "filme"("tmdb_id");

-- CreateIndex
CREATE INDEX "filme_categoria_acervo_idx" ON "filme"("categoria_acervo");

-- CreateIndex
CREATE INDEX "filme_indexado_em_idx" ON "filme"("indexado_em");

-- CreateIndex
CREATE INDEX "conexao_filme_origem_id_idx" ON "conexao"("filme_origem_id");

-- CreateIndex
CREATE UNIQUE INDEX "conexao_filme_origem_id_filme_destino_id_tipo_key" ON "conexao"("filme_origem_id", "filme_destino_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "jornada_filme_jornada_id_ordem_key" ON "jornada_filme"("jornada_id", "ordem");

-- CreateIndex
CREATE INDEX "lista_editorial_periodo_idx" ON "lista_editorial"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "lista_editorial_filme_lista_id_ordem_key" ON "lista_editorial_filme"("lista_id", "ordem");

-- CreateIndex
CREATE INDEX "sessao_curador_idx" ON "sessao"("curador");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_sessao_id_ordem_key" ON "mensagem"("sessao_id", "ordem");

-- CreateIndex
CREATE INDEX "conversa_qualidade_idx" ON "conversa"("qualidade");

-- CreateIndex
CREATE INDEX "conversa_consenso_idx" ON "conversa"("consenso");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_usuario_id_key" ON "perfil"("usuario_id");

-- AddForeignKey
ALTER TABLE "conexao" ADD CONSTRAINT "conexao_filme_origem_id_fkey" FOREIGN KEY ("filme_origem_id") REFERENCES "filme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conexao" ADD CONSTRAINT "conexao_filme_destino_id_fkey" FOREIGN KEY ("filme_destino_id") REFERENCES "filme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_filme" ADD CONSTRAINT "jornada_filme_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_filme" ADD CONSTRAINT "jornada_filme_filme_id_fkey" FOREIGN KEY ("filme_id") REFERENCES "filme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_editorial_filme" ADD CONSTRAINT "lista_editorial_filme_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "lista_editorial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_editorial_filme" ADD CONSTRAINT "lista_editorial_filme_filme_id_fkey" FOREIGN KEY ("filme_id") REFERENCES "filme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversa_filme" ADD CONSTRAINT "conversa_filme_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversa_filme" ADD CONSTRAINT "conversa_filme_filme_id_fkey" FOREIGN KEY ("filme_id") REFERENCES "filme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_filme_assistido" ADD CONSTRAINT "perfil_filme_assistido_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_filme_assistido" ADD CONSTRAINT "perfil_filme_assistido_filme_id_fkey" FOREIGN KEY ("filme_id") REFERENCES "filme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_jornada" ADD CONSTRAINT "perfil_jornada_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_jornada" ADD CONSTRAINT "perfil_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
