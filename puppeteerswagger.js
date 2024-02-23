// Importação de módulos
const express = require('express'); // Framework para criação de APIs RESTful
const puppeteer = require('puppeteer'); // Biblioteca para web scraping
const swaggerUi = require('swagger-ui-express'); // Swagger para documentação da API
const swaggerJsdoc = require('swagger-jsdoc'); // Swagger para documentação da API

// Inicialização da aplicação Express
const app = express(); 
const port = 8080; // Porta em que o servidor irá rodar

let products = []; // Array para armazenar os produtos

// Função assíncrona para realizar o web scraping
(async () => {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: false });
  const page = await browser.newPage();

  await page.goto('https://br.openfoodfacts.org');

  while (true) {
    // Obtenção do link da próxima página
    const nextPageButton = await page.$('ul#pages.pagination a[rel="next$nofollow"]');
    const nextPageLink = await page.evaluate(nextPageButton => nextPageButton.href, nextPageButton);

    // Obtenção dos links dos produtos na página atual
    const productLinks = await page.$$eval('.list_product_a', links => links.map(link => link.href));

    // Iteração sobre os links dos produtos
    for (const link of productLinks) {
      await page.goto(link);

      // Obtenção das informações do produto
      const productName = await page.$eval('h2.title-1[property="food:name"][itemprop="name"]', element => element.textContent.trim());
      const productId = await page.$eval('span#barcode[property="food:code"][itemprop="gtin13"]', element => element.textContent.trim());
      const nutriScore = await page.$eval('#attributes_grid > li:nth-child(1) > a > div > div > div.attr_text > h4', element => {
        const text = element.textContent.trim();
        return text.substring(text.lastIndexOf(' ') + 1);
      });
      const nutriScoreTitle = await page.$eval('#attributes_grid > li:nth-child(1) > a > div > div > div.attr_text > span', element => element.textContent.trim());
      const novaScore = await page.$eval('#attributes_grid > li:nth-child(2) > a > div > div > div.attr_text > h4', element => {
        const text = element.textContent.trim();
        return text.split(' ')[1];
      });
      const novaTitle = await page.$eval('#attributes_grid > li:nth-child(2) > a > div > div > div.attr_text > span', element => element.textContent.trim());
      const quantityElement = await page.$('span#field_quantity_value');
      const quantity = quantityElement ? await quantityElement.evaluate(element => element.textContent.trim()) : 'N/A';
      const hasPalmOilElement = await page.$('#panel_ingredients_analysis_en-palm-oil-content-unknown > li > a > h4');
      const hasPalmOil = hasPalmOilElement ? await hasPalmOilElement.evaluate(element => element.textContent.trim()) : 'unknown';
      const isVegetarianElement = await page.$('#panel_ingredients_analysis_en-vegetarian-status-unknown > li > a > h4');
      const isVegetarian = isVegetarianElement ? await isVegetarianElement.evaluate(element => element.textContent.trim()) : 'unknown';
      const isVeganElement = await page.$('#panel_ingredients_analysis_en-vegan-status-unknown > li > a > h4');
      const isVegan = isVeganElement ? await isVeganElement.evaluate(element => element.textContent.trim()) : 'unknown';

      // Obtenção dos valores nutricionais
      const values = await page.$$eval('#panel_nutrient_levels_content > div > ul', uls =>
        uls.map(ul => {
          const imgSrc = ul.querySelector('li > a > img').getAttribute('src');
          let nutritionValue = 'unknown';
          if (imgSrc.includes('high.svg')) {
              nutritionValue = 'high';
          } else if (imgSrc.includes('moderate.svg')) {
              nutritionValue = 'moderate';
          } else if (imgSrc.includes('low.svg')) {
              nutritionValue = 'low';
          }
          const nutritionTitle = ul.querySelector('li > a > h4').textContent.trim();
          return [nutritionValue, nutritionTitle];
        })
      );

      // Obtenção das informações nutricionais
      const rows = await page.$$eval('#panel_nutrition_facts_table_content > div > table > tbody > tr', rows =>
        rows.map(row => {
          const label = row.children[0]?.textContent?.trim() || '';
          const value100g = row.children[1]?.textContent?.trim() || '';
          const valuePorcao = row.children[2]?.textContent?.trim() || '';
          return { label, per100g: value100g, perServing: valuePorcao };
        })
      );

      // Filtragem das informações nutricionais
      const filteredRows = rows.filter(row => row.label !== '');
      let data = {};
      filteredRows.forEach(row => {
        data[row.label] = {
          per100g: row.per100g,
          perServing: row.perServing
        };
      });

      // Criação do objeto com as informações do produto
      const productInfo = {
        productName,
        productId,
        nutrition: {
          score: nutriScore,
          title: nutriScoreTitle
        },
        nova: {
          score: novaScore,
          title: novaTitle
        },
        quantity,
        hasPalmOil,
        isVegetarian,
        isVegan,
        nutritionFacts: data,
        value: values,
      };

      // Adição do produto à lista de produtos
      products.push(productInfo);
    }

    // Verificação da existência de próxima página
    if (!nextPageButton) {
      console.log('Não há próxima página. Saindo do loop.');
      break;
    }

    // Navegação para próxima página
    await page.goto(nextPageLink);
    await page.waitForSelector('.tabs.content.active');
  }

  console.log('Chegou à última página.');
})();

// Definição das opções do Swagger
const swaggerOptions = {
  swaggerDefinition: {
    info: {
      title: 'Open Food Facts API',
      description: 'API para acessar informações de produtos alimentícios do Open Food Facts',
      version: '1.0.0',
    },
  },
  apis: ['puppeteerswagger.js'], // Arquivo de definição das rotas da API
};

// Criação da documentação Swagger
const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Configuração do Swagger na rota /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /products:
 *   get:
 *     description: Retorna a lista de produtos
 *     parameters:
 *       - in: query
 *         name: nutrition
 *         schema:
 *           type: string
 *         description: Score de nutrição do produto (A, B, C, D, E)
 *       - in: query
 *         name: nova
 *         schema:
 *           type: integer
 *         description: Score NOVA do produto (1, 2, 3, 4)
 *       - in: query
 *         name: hasPalmOil
 *         schema:
 *           type: string
 *         description: Indica se o produto contém óleo de palma
 *       - in: query
 *         name: isVegetarian
 *         schema:
 *           type: string
 *         description: Indica se o produto é vegetariano
 *       - in: query
 *         name: isVegan
 *         schema:
 *           type: string
 *         description: Indica se o produto é vegano
 *     responses:
 *       200:
 *         description: Sucesso
 */
app.get('/products', (req, res) => {
  const { nutrition, nova, hasPalmOil, isVegetarian, isVegan } = req.query;

  // Filtragem dos produtos com base nos parâmetros da requisição
  let filteredProducts = [...products];
  if (nutrition) {
    filteredProducts = filteredProducts.filter(product => product.nutrition.score === nutrition);
  }
  if (nova) {
    filteredProducts = filteredProducts.filter(product => parseInt(product.nova.score) === parseInt(nova));
  }
  if (hasPalmOil) {
    filteredProducts = filteredProducts.filter(product => product.hasPalmOil === hasPalmOil);
  }
  if (isVegetarian) {
    filteredProducts = filteredProducts.filter(product => product.isVegetarian === isVegetarian);
  }
  if (isVegan) {
    filteredProducts = filteredProducts.filter(product => product.isVegan === isVegan);
  }

  // Envio da lista de produtos filtrada como resposta
  res.json(filteredProducts);
});

// Inicialização do servidor na porta especificada
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
