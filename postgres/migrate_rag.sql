-- Base de conhecimento para RAG (perguntas / situações importantes)
CREATE TABLE IF NOT EXISTS salao.conhecimento (
  id SERIAL PRIMARY KEY,
  topico VARCHAR(64) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  conteudo TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  servico_ref VARCHAR(120),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  embedding JSONB,
  busca tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      coalesce(titulo, '') || ' ' || coalesce(conteudo, '') || ' ' || coalesce(topico, '') || ' ' || coalesce(servico_ref, '')
    )
  ) STORED,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conhecimento_ativo ON salao.conhecimento (ativo);
CREATE INDEX IF NOT EXISTS idx_conhecimento_topico ON salao.conhecimento (topico);
CREATE INDEX IF NOT EXISTS idx_conhecimento_busca ON salao.conhecimento USING GIN (busca);

-- Seed idempotente (só insere se a tabela estiver vazia)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM salao.conhecimento LIMIT 1) THEN
    INSERT INTO salao.conhecimento (topico, titulo, conteudo, tags, servico_ref) VALUES
    ('funcionamento', 'Horário de funcionamento',
     'O Studio Erika Thebas funciona de terça a sábado, das 09:00 às 18:00. Domingo e segunda estamos fechados. Almoço das 12:00 às 12:20.',
     ARRAY['horario','funcionamento','abre','fecha','terca','sabado'], NULL),

    ('almoco', 'Horário de almoço',
     'O intervalo de almoço da equipe é das 12:00 às 12:20. Nesse período não abrimos novos atendimentos.',
     ARRAY['almoco','intervalo'], NULL),

    ('feriados', 'Atendimento em feriados',
     'Em feriados atendemos sujeito à disponibilidade da equipe. O ideal é confirmar pelo WhatsApp com antecedência.',
     ARRAY['feriado','feriados'], NULL),

    ('fora_horario', 'Atendimento fora do horário',
     'Atendimentos fora do horário comercial podem ser combinados com a recepção e têm acréscimo de 30% sobre o valor do serviço.',
     ARRAY['fora','horario','acrescimo','30%'], NULL),

    ('antecedencia', 'Antecedência para agendar',
     'Preferimos agendamentos com cerca de 2 horas de antecedência para organizar a agenda da equipe. Em alguns casos dá para encaixar antes — consulte disponibilidade.',
     ARRAY['antecedencia','agendar','encaixe'], NULL),

    ('atraso', 'Tolerância de atraso',
     'Pedimos pontualidade. Em caso de atraso, avisamos com antecedência pelo WhatsApp. Atrasos maiores podem reduzir o tempo do serviço ou exigir remarcação, conforme a agenda do dia.',
     ARRAY['atraso','tolerancia','pontualidade'], NULL),

    ('formas_pagamento', 'Formas de pagamento',
     'Aceitamos pagamento no studio. Para confirmar PIX, cartão ou dinheiro no dia do atendimento, a recepção confirma no local. Valores de serviço estão no catálogo do bot.',
     ARRAY['pagamento','pix','cartao','dinheiro'], NULL),

    ('sinal_agendamento', 'Sinal / pagamento antecipado',
     'Alguns serviços ou horários especiais podem pedir sinal ou confirmação antecipada. Quando for o caso, a recepção informa no momento do agendamento.',
     ARRAY['sinal','antecipado','entrada'], NULL),

    ('politica_remarcacao', 'Política de remarcação',
     'Dá para remarcar pelo WhatsApp: cancelamos o horário antigo e marcamos um novo com disponibilidade real. Quanto antes avisar, melhor para liberar a agenda.',
     ARRAY['remarcar','remarcacao','remarca','trocar','mudar','politica'], NULL),

    ('politica_cancelamento', 'Política de cancelamento',
     'Cancelamentos são feitos pelo WhatsApp informando o horário. Evite faltar sem aviso. Se houver taxa ou regra especial para o seu caso, a recepção informa — não inventamos multa.',
     ARRAY['cancelar','cancelamento','desmarcar','multa'], NULL),

    ('endereco', 'Endereço e como chegar',
     'Para endereço completo, ponto de referência e orientações de chegada, a recepção do Studio Erika Thebas confirma no atendimento. Peça "endereço" que encaminhamos a confirmação oficial.',
     ARRAY['endereco','onde fica','localizacao','chegar'], NULL),

    ('estacionamento', 'Estacionamento',
     'Informações de estacionamento (próprio ou próximo) são confirmadas pela recepção, pois podem variar. Pergunte e nós checamos o dado oficial.',
     ARRAY['estacionamento','vaga','carro'], NULL),

    ('fidelidade', 'Programa de fidelidade',
     'Se houver cartão ou programa de fidelidade ativo, a recepção explica as regras atuais. Não garantimos promoção sem cadastro no sistema.',
     ARRAY['fidelidade','cartao','pontos'], NULL),

    ('desconto', 'Descontos e promoções',
     'Descontos e promoções mudam. Só confirmamos campanhas cadastradas ou informadas pela recepção. Primeira visita: pergunte se há condição especial no momento.',
     ARRAY['desconto','promocao','primeira vez'], NULL),

    ('preparo_lavagem', 'Preparo antes do atendimento (cabelo)',
     'Em geral, para coloração e químicas, evite lavar o cabelo imediatamente antes se a profissional pedir o contrário. Para corte e escova, venha com o cabelo em condições confortáveis. Orientações específicas por serviço vêm da profissional no dia.',
     ARRAY['preparo','lavar','antes'], 'cabelo'),

    ('preparo_unhas', 'Preparo antes do atendimento (unhas)',
     'Para manicure/pedicure e alongamentos, o ideal é não remover o esmalte em casa se a profissional for avaliar o estado das unhas — a menos que ela peça. Unhas muito curtas ou danificadas podem limitar algumas técnicas.',
     ARRAY['preparo','esmalte','unhas'], 'unha'),

    ('contraindicacao', 'Contraindicações e alergias',
     'Se você tem alergia a química, esmalte, gel ou histórico de irritação, avise antes do atendimento. Em dúvida médica, oriente-se com um profissional de saúde — o studio não substitui avaliação clínica.',
     ARRAY['alergia','contraindicacao','irritacao'], NULL),

    ('quimica_anterior', 'Cabelo com química anterior',
     'Cabelos com coloração, progressiva, descoloração ou outros procedimentos precisam de avaliação. A profissional analisa o estado do fio no dia para indicar o que é seguro fazer.',
     ARRAY['quimica','progressiva','descoloracao'], 'cabelo'),

    ('cabelo_cacheado', 'Atendimento para cabelo cacheado/crespo',
     'Atendemos cabelos cacheados e crespos com técnicas adequadas (corte, hidratação, finalização). Informe o tipo de fio e o resultado desejado para indicar o serviço certo.',
     ARRAY['cacheado','crespo','curly'], 'cabelo'),

    ('cuidados_depois', 'Cuidados depois do serviço',
     'Após coloração, mechas ou químicas, evite lavar o cabelo no mesmo dia se a profissional orientar. Após unhas em gel, evite esforço excessivo e produtos agressivos nas primeiras horas. A profissional passa o cuidado específico no fim do atendimento.',
     ARRAY['depois','cuidados','pos'], NULL),

    ('duracao_resultado', 'Duração do resultado',
     'A duração do resultado depende do serviço, do tipo de fio/unha e dos cuidados em casa. Escova e penteado duram menos; coloração e mechas variam; unhas em gel costumam pedir manutenção periódica. Peça a estimativa da profissional no seu caso.',
     ARRAY['dura','resultado','semanas','manutencao'], NULL),

    ('manutencao', 'Manutenção de serviços',
     'Mechas, coloração e unhas em gel pedem manutenção conforme o crescimento e o desgaste. A frequência ideal é definida pela profissional após avaliar o seu caso.',
     ARRAY['manutencao','retoque','retorno'], NULL),

    ('combinar_servicos', 'Combinar serviços no mesmo dia',
     'Dá para combinar serviços no mesmo dia (ex.: corte + escova, coloração + hidratação), desde que a duração total caiba na agenda. Consulte disponibilidade — o bot soma as durações reais do catálogo.',
     ARRAY['combinar','mesmo dia','pacote'], NULL),

    ('criancas', 'Atendimento infantil',
     'Atendemos crianças conforme o serviço (ex.: corte infantil, quando oferecido no catálogo). Menores devem estar acompanhados. Confirme o serviço infantil disponível no catálogo.',
     ARRAY['crianca','infantil','filho'], NULL),

    ('dor', 'Desconforto durante o atendimento',
     'Alguns procedimentos (química, alongamento, cutilagem) podem gerar desconforto leve. Avise a profissional na hora se sentir dor ou irritação para ajustar a técnica.',
     ARRAY['dor','doi','desconforto'], NULL),

    ('garantia', 'Garantia e retoque',
     'Políticas de garantia ou retoque dependem do serviço e da avaliação da profissional. Se algo não ficou como combinado, fale conosco pelo WhatsApp para a recepção orientar.',
     ARRAY['garantia','retoque','reclamacao'], NULL),

    ('fotos', 'Fotos e portfólio',
     'Podemos orientar sobre o estilo de resultado. Referências por foto ajudam a profissional. Portfólio oficial: peça à recepção os canais atuais (Instagram etc.).',
     ARRAY['fotos','portfolio','instagram','referencia'], NULL),

    ('produtos', 'Produtos utilizados',
     'Os produtos variam por serviço e avaliação do fio/unha. A profissional informa no atendimento o que será usado. Não afirmamos marcas sem cadastro no sistema.',
     ARRAY['produtos','marca','natural'], NULL),

    ('parcelamento', 'Parcelamento',
     'Condições de parcelamento, se disponíveis, são confirmadas pela recepção no momento do pagamento. Não inventamos número de parcelas.',
     ARRAY['parcelar','parcelamento','vezes'], NULL),

    ('equipe', 'Equipe do studio',
     'A equipe ativa está cadastrada no sistema. Use a consulta de profissionais para ver quem atende cada serviço. Preferência por profissional pode ser informada no agendamento.',
     ARRAY['equipe','profissional','quem faz'], NULL),

    ('preco_orientacao', 'Como consultar preços',
     'Preços e duração oficiais vêm do catálogo de serviços no banco. Peça o nome do serviço (corte feminino, escova, manicure, etc.) para informarmos valor e tempo reais. Não inventamos preço.',
     ARRAY['preco','valor','quanto custa'], NULL),

    ('situacao_reclamacao', 'Reclamação ou problema',
     'Em reclamação, insatisfação ou situação sensível: acolha com empatia, peça detalhes objetivos e diga que a recepção humana vai acompanhar. Não prometa reembolso sem confirmação.',
     ARRAY['reclamacao','problema','insatisfeita','erro'], NULL),

    ('situacao_urgencia', 'Encaixe / urgência',
     'Para urgência ou encaixe no mesmo dia, consultamos a disponibilidade real na agenda. Se não houver vaga, oferecemos o próximo horário livre — sem inventar encaixe.',
     ARRAY['urgencia','encaixe','hoje','rapido'], NULL),

    ('escopo_bot', 'O que o atendimento virtual resolve',
     'Pelo WhatsApp você consulta serviços, preços, profissionais, horários livres, agenda, cancela e tira dúvidas com base no conhecimento cadastrado. Questões médicas, jurídicas ou financeiras complexas vão para a recepção humana.',
     ARRAY['ajuda','o que faz','bot','duvida'], NULL);
  END IF;
END $$;
