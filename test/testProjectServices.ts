import { ProjectStateManager } from '../services/projectStateManager';
import { AutoSaveService } from '../services/autoSaveService';
import { ProjectV2 } from '../types';

// 测试项目状态管理器和自动保存服务
export const testProjectServices = async () => {
  console.log('开始测试项目服务...');
  
  try {
    // 初始化项目状态管理器
    const stateManager = new ProjectStateManager();
    await stateManager.initialize();
    console.log('✓ 项目状态管理器初始化成功');
    
    // 创建自动保存服务
    const autoSave = new AutoSaveService(stateManager);
    console.log('✓ 自动保存服务创建成功');
    
    // 创建测试项目
    const testProject: ProjectV2 = {
      id: 'test-project-' + Date.now(),
      name: '测试项目',
      description: '这是一个测试项目',
      createdAt: Date.now(),
      lastModified: Date.now(),
      volumes: [],
      assets: [],
      storyBible: null,
      activeStyle: null,
      customStyles: [],
      version: '2.0'
    };
    
    // 测试创建项目
    await stateManager.createProject(testProject);
    console.log('✓ 项目创建成功');
    
    // 测试获取项目
    const retrievedProject = await stateManager.getProject(testProject.id);
    if (retrievedProject && retrievedProject.name === testProject.name) {
      console.log('✓ 项目获取成功');
    } else {
      console.error('✗ 项目获取失败');
      return false;
    }
    
    // 测试更新项目
    const updatedProject = { ...retrievedProject, name: '更新后的测试项目' };
    await stateManager.updateProject(testProject.id, updatedProject);
    console.log('✓ 项目更新成功');
    
    // 测试自动保存
    autoSave.saveProject(testProject.id);
    console.log('✓ 自动保存触发成功');
    
    // 等待自动保存完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试删除项目
    await stateManager.deleteProject(testProject.id);
    console.log('✓ 项目删除成功');
    
    console.log('所有测试通过！');
    return true;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
};

// 在浏览器控制台中运行此测试
// testProjectServices().then(success => console.log(success ? '测试成功' : '测试失败'));