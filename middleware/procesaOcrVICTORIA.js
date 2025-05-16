var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");

const procesaOcrVICTORIA = async (ocr, ocrPL, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrVICTORIATerrestre(ocr, ocrPL, nroDespacho, "T");
  }
};

const procesaOcrVICTORIATerrestre = async (ocr, ocrPL, nroDespacho, tipo) => {
  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }
  let dataFactura = await procesaFactura(paginasFactura, ocr, ocrPL);

  let paginasPackingList = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("LISTA DE EMPAQUE")) {
      paginasPackingList.push(i);
    }
  }
  let dataPacking = await procesaPackingList(paginasPackingList, ocr, ocrPL);

  try {
    await imp_importacion_archivo.update(
      {
        detalles: JSON.stringify(dataFactura),
        packingList: JSON.stringify(dataPacking),
      },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }
};

const procesaFactura = async (paginasFactura, ocr, ocrPL) => {
  let data = [];
  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("CANTIDAD") &&
        texto.includes("PAQUETE") &&
        texto.includes("PRODUCTOS")
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 1) {
            break;
          }

          let lineaMas0 = tabla[k].replace().split("\t");

          let campos = lineaMas0.filter((item) => !item.includes("\r"));

          if (campos.length >= 5) {
            let codigo = campos[2].slice(0, 10);
            let cantidad = limpiarTexto(campos[0]);
            let valor = limpiarTexto(campos[campos.length - 1]);
            let peso = await getPeso(tabla);
            let item = {
              cantidad: cantidad,
              codigo: codigo,
              descripcion: "",
              valor: valor,
              peso: peso,
              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
            };

            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valorInvalido = await valValor(item.valor);

            let pesoInvalido = await valCantidad(item.peso);
            if (pesoInvalido) {
              item.peso = "0";
            }

            data.push(item);
          }
        }
      }
    }
  }
  return data;
};

const procesaPackingList = async (paginasPackingList, ocr, ocrPL) => {
  let dataPacking = [];
  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("CAJAS") &&
        texto.includes("NETO") &&
        texto.includes("BRUTO")
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 1) {
            break;
          }

          if (tabla[k].includes("TOTAL")) {
            break;
          }

          let lineaMas0 = tabla[k].replace().split("\t");

          let campos = lineaMas0.filter((item) => !item.includes("\r"));

          let vencimiento = await getVencimiento(tabla);

          if (campos.length >= 4) {
            let itemPL = {
              descripcion: campos[0].slice(0, 15),
              fechaProduccion: "",
              sif: "1",
              fechaVencimiento: vencimiento,
              CajasPallet: limpiarTexto(campos[1]),
              PesoNeto: limpiarTexto(campos[2]),
              PesoBruto: limpiarTexto(campos[3]),
              vencimientoInvalido: await valFecha(vencimiento),
              pesonetoInvalido: await valValor(limpiarTexto(campos[2])),
              pesobrutoInvalido: await valValor(limpiarTexto(campos[3])),
            };
            dataPacking.push(itemPL);
          }
        }
      }
    }
  }

  return dataPacking;
};

const getPeso = async (tabla) => {
  let peso = "";
  for (let [i, e] of tabla.entries()) {
    let texto = e.toUpperCase();
    if (texto.includes("PESO NETO") || texto.includes("NET WEIGHT")) {
      let lineaMas0 = texto.replace().split("\t");

      let campos = lineaMas0.filter((item) => !item.includes("\r"));
      peso = campos[campos.length - 1].replace(/,/g, "");
    }
  }
  return peso;
};

const getVencimiento = async (tabla) => {
  let fecha = "";
  for (let [i, e] of tabla.entries()) {
    let texto = e.toUpperCase();
    if (texto.includes("EXPIRA")) {
      let lineaMas0 = texto.replace().split("\t");

      let campos = lineaMas0.filter((item) => !item.includes("\r"));
      fecha = campos[campos.length - 1].replace(/,/g, "");

      let df = fecha.split("/");
      fecha =
        df[2] + "/" + df[1].padStart(2, "0") + "/" + df[0].padStart(2, "0");
    }
  }
  return fecha;
};

function limpiarTexto(texto) {
  // Eliminar todas las comas
  let sinComas = texto.replace(/[^0-9.]/g, "");

  // Encontrar la última aparición de un punto
  const ultimaPosicionPunto = sinComas.lastIndexOf(".");

  if (ultimaPosicionPunto !== -1) {
    let sinPuntos = "";
    let arr = sinComas.split(".");
    // Recorrer el arreglo hacia atrás

    if (arr.length > 2) {
      for (let [i, e] of arr.entries()) {
        if (i == arr.length - 2) {
          sinPuntos = sinPuntos + e + ".";
        } else {
          sinPuntos = sinPuntos + e;
        }
      }
      sinComas = sinPuntos;
    }
  }

  return sinComas;
}

const buscaCodigoValido = async (arr) => {
  let existe = false;
  let posicion = 0;
  let descripcion = "";
  for ([i, e] of arr.entries()) {
    let codigo = e;
    if (codigo.length > 0) {
      let existeSku = await imp_sku.findOne({
        where: { sku: codigo },
      });
      if (existeSku) {
        posicion = i;
        existe = true;
        descripcion = existeSku.producto;
        break;
      }
    }
  }
  return { existe, posicion, descripcion };
};

module.exports = procesaOcrVICTORIA;
