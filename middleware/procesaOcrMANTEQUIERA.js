var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");

const procesaOcrMANTIQUEIRA = async (ocr, ocrPL, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrMANTIQUEIRATerrestre(ocr, ocrPL, nroDespacho, "T");
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "AEREA") {
    return procesaOcrMANTIQUEIRAMaritimo(ocr, ocrPL, nroDespacho, "A");
  }
};

const procesaOcrMANTIQUEIRATerrestre = async (
  ocr,
  ocrPL,
  nroDespacho,
  tipo
) => {
  let data = [];
  let dataPacking = [];
  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }

  let paginasPackingList = [];
};

const procesaOcrMANTIQUEIRAMaritimo = async (ocr, ocrPL, nroDespacho, tipo) => {
  let data = [];
  let dataPacking = [];
  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("COMMERCIAL INVOICE")) {
      paginasFactura.push(i);
    }
  }

  let paginasPackingList = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("CONTAINER") ||
        (texto.includes("DESCRIPTION") && texto.includes("WEIGHT"))
      ) {
        let indInicio = i;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 1) {
            break;
          }

          let lineaMas0 = tabla[k].replace().split("\t");

          let campos = lineaMas0.filter((item) => !item.includes("\r"));
          let lineaTieneCodigo = await buscaCodigoValido(lineaMas0);

          if (lineaTieneCodigo.existe) {
            let indiceCodigo = lineaTieneCodigo.posicion;

            let codigo = lineaMas0[indiceCodigo];
            let codigoInvalido = await valCodigo(codigo);

            if (!codigoInvalido) {
              let item = {
                cantidad: limpiarTexto(campos[indiceCodigo + 2]),
                codigo: codigo,
                descripcion: lineaTieneCodigo.descripcion,
                valor: limpiarTexto(campos[campos.length - 1]),
                peso: limpiarTexto(campos[indiceCodigo + 3]),

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

    dataPacking = await getPackingList(ocr, ocrPL, paginasPackingList);

    try {
      await imp_importacion_archivo.update(
        {
          detalles: JSON.stringify(data),
          packingList: JSON.stringify(dataPacking),
        },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }
};

const getPackingList = async (ocr, ocrPL, paginasPackingList) => {
  let dataPacking = [];
  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("CONTAINER")) {
        let indInicio = i;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 1) {
            break;
          }

          let lineaMas0 = tabla[k].replace().split("\t");
          let vencimiento = "";

          if (lineaMas0.length > 7) {
            let fechaEncontrada = "";
            for (let l = lineaMas0.length - 1; l >= 0; l--) {
              let posibleFecha = lineaMas0[l].trim();
              if (
                /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/.test(
                  posibleFecha
                )
              ) {
                fechaEncontrada = posibleFecha;
                break;
              }
            }
            vencimiento = fechaEncontrada;
          }

          if (vencimiento.length > 0) {
            let partesFecha = vencimiento.split("/");
            if (partesFecha.length === 3) {
              vencimiento = `${partesFecha[2]}/${partesFecha[0].padStart(
                2,
                "0"
              )}/${partesFecha[1].padStart(2, "0")}`;
            }
          }

          if (vencimiento.length > 0) {
            let itemPL = {
              descripcion: "ITEM DESCRIPTION",
              fechaProduccion: "",
              sif: "1",
              fechaVencimiento: vencimiento,
              CajasPallet: "1",
              PesoNeto: "1",
              PesoBruto: "1",
              vencimientoInvalido: await valFecha(vencimiento),
              pesonetoInvalido: false,
              pesobrutoInvalido: false,
            };
            dataPacking.push(itemPL);
          }
        }
      }
    }
  }
  return dataPacking;
};

function limpiarTexto(texto) {
  // Eliminar todas las comas
  let sinComas = texto.replace(/,/g, "");

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

module.exports = procesaOcrMANTIQUEIRA;
