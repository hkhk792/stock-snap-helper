// 测试API功能
const { searchFundsApi, getGlobalIndices } = require('./src/lib/fund-api.ts');

async function testSearch() {
  console.log('测试基金搜索...');
  try {
    const results = await searchFundsApi('易方达');
    console.log('搜索结果:', results);
    console.log('搜索结果数量:', results.length);
  } catch (error) {
    console.error('搜索测试失败:', error);
  }
}

async function testIndices() {
  console.log('\n测试大盘指数...');
  try {
    const indices = await getGlobalIndices();
    console.log('指数结果:', indices);
    console.log('指数数量:', indices.length);
  } catch (error) {
    console.error('指数测试失败:', error);
  }
}

async function runTests() {
  await testSearch();
  await testIndices();
}

runTests();
