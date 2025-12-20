import { ItemView, Notice, Plugin, TFile, WorkspaceLeaf, setIcon } from 'obsidian';

// 뷰 타입 식별자
const VIEW_TYPE_FOLDER_FILES = 'folder-files-view';

// 폴더 파일 목록 뷰 클래스
class FolderFilesView extends ItemView {
	currentFolderPath: string | null = null;
	previousFolderPath: string | null = null;

	private getContentContainer(): HTMLElement {
		return this.containerEl.children[1] as HTMLElement;
	}

	private renderEmptyList(): void {
		const container = this.getContentContainer();
		container.empty();
		container.createEl('div', {
			cls: 'folder-files-list'
		});
	}

	private renderFileItems(fileListContainer: HTMLElement, files: TFile[], activeFile: TFile | null): void {
		files.forEach(file => {
			const fileItem = fileListContainer.createEl('div', {
				cls: 'tree-item nav-file'
			});

			const fileTitle = fileItem.createEl('div', {
				cls: 'tree-item-self is-clickable nav-file-title'
			});
			fileTitle.dataset.filePath = file.path;

			// 현재 활성 파일이면 하이라이트
			if (activeFile && file.path === activeFile.path) {
				fileTitle.addClass('is-active');
			}

			// 파일 이름 표시
			fileTitle.createEl('div', {
				text: file.basename,
				cls: 'tree-item-inner nav-file-title-content'
			});

			// 삭제 버튼
			const deleteButton = fileTitle.createEl('div', {
				cls: 'folder-files-delete-btn tree-item-icon'
			});
			setIcon(deleteButton, 'lucide-x');

			// 파일 클릭 이벤트 - 해당 파일 열기
			fileTitle.addEventListener('click', async () => {
				await this.app.workspace.getLeaf().openFile(file);
			});

			// 삭제 버튼 클릭 이벤트
			deleteButton.addEventListener('click', async (event) => {
				event.stopPropagation();
				
				try {
					await this.app.fileManager.trashFile(file);
				} catch (error) {
					new Notice(`파일 삭제 실패: ${error.message}`);
					console.error('File deletion error:', error);
				}
			});
		});
	}

	private renderFolder(folderPath: string, activeFile: TFile | null): void {
		const container = this.getContentContainer();
		container.empty();

		const fileListContainer = container.createEl('div', {
			cls: 'folder-files-list'
		});

		const filesInFolder = this.app.vault.getFiles().filter(file => {
			const fileFolderPath = file.parent?.path || '';
			return fileFolderPath === folderPath;
		});

		const sortedFiles = filesInFolder.sort((a, b) => b.stat.mtime - a.stat.mtime);
		this.renderFileItems(fileListContainer, sortedFiles, activeFile);
	}

	// 삭제 이벤트용: 현재 표시 중인 폴더 기준으로 강제 리렌더링
	renderForFolder(folderPath: string): void {
		this.currentFolderPath = folderPath;
		const activeFile = this.app.workspace.getActiveFile();
		this.renderFolder(folderPath, activeFile);
	}

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_FOLDER_FILES;
	}

	getDisplayText(): string {
		return '폴더 파일 목록';
	}

	getIcon(): string {
		return 'lucide-folder-closed';
	}

	async onOpen() {
		// 초기 렌더링
		this.updateView();
	}

	async onClose() {
		// 정리 작업
	}

	// 뷰 업데이트 - 현재 활성 파일의 폴더 기준으로 파일 목록 표시
	updateView() {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			// 활성 파일이 없을 때 - 빈 목록만 표시
			this.currentFolderPath = null;
			this.renderEmptyList();
			return;
		}

		// 현재 파일의 폴더 경로 파악
		const folderPath = activeFile.parent?.path || '';
		
		// 폴더가 변경되었을 때 이전 폴더 저장
		if (this.currentFolderPath !== null && this.currentFolderPath !== folderPath) {
			this.previousFolderPath = this.currentFolderPath;
		}
		
		this.currentFolderPath = folderPath;

		this.renderFolder(folderPath, activeFile);
	}

	// 같은 폴더 내에서 파일만 바뀐 경우 하이라이트만 업데이트
	updateHighlight() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const container = this.getContentContainer();
		const fileItems = container.querySelectorAll('.nav-file-title');

		fileItems.forEach(item => {
			// 이전 하이라이트 제거
			item.removeClass('is-active');
			
			// 현재 활성 파일이면 하이라이트 추가
			const filePath = (item as HTMLElement).dataset.filePath;
			if (filePath && filePath === activeFile.path) {
				item.addClass('is-active');
			}
		});
	}
}

// 메인 플러그인 클래스
export default class FolderViewerPlugin extends Plugin {
	async onload() {
		// 뷰 등록
		this.registerView(
			VIEW_TYPE_FOLDER_FILES,
			(leaf) => new FolderFilesView(leaf)
		);

		// 왼쪽 사이드바에 열기 명령어
		this.addCommand({
			id: 'open-left',
			name: '왼쪽 사이드바에 열기',
			callback: () => {
				this.activateView('left');
			}
		});

		// 오른쪽 사이드바에 열기 명령어
		this.addCommand({
			id: 'open-right',
			name: '오른쪽 사이드바에 열기',
			callback: () => {
				this.activateView('right');
			}
		});

		// 뷰 닫기 명령어
		this.addCommand({
			id: 'close-view',
			name: '뷰 닫기',
			callback: () => {
				this.closeView();
			}
		});

		// 이전 폴더로 이동 명령어
		this.addCommand({
			id: 'go-to-previous-folder',
			name: '이전 폴더로 이동',
			icon: 'lucide-arrow-left',
			callback: () => {
				this.goToPreviousFolder();
			}
		});

		// file-open 이벤트 리스너 - 파일이 열릴 때마다 뷰 업데이트
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					this.handleFileChange(file, false);
				} else {
					// 활성 파일이 없을 때 (빈 탭) - 모든 뷰를 빈 목록으로 업데이트
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_FILES);
					leaves.forEach(leaf => {
						const view = leaf.view as FolderFilesView;
						view.updateView();
					});
				}
			})
		);

		// vault create 이벤트 - 파일 생성 시 뷰 업데이트
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange(file, true);
				}
			})
		);

		// vault delete 이벤트 - 파일 삭제 시 뷰 업데이트
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					// 모든 뷰를 찾아서 각 뷰의 currentFolderPath 기준으로 업데이트
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_FILES);
					
					leaves.forEach(leaf => {
						const view = leaf.view as FolderFilesView;
						
						// 뷰가 표시 중인 폴더가 있으면 그 폴더 기준으로 재렌더링
						if (view.currentFolderPath !== null) {
							view.renderForFolder(view.currentFolderPath);
						} else {
							view.updateView();
						}
					});
				}
			})
		);

		// vault rename 이벤트 - 파일 이름 변경 시 뷰 업데이트
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					this.handleFileChange(file, true);
				}
			})
		);

		// vault modify 이벤트 - 파일 수정 시 정렬 순서 업데이트
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange(file, true);
				}
			})
		);
	}

	onunload() {
		// 플러그인 언로드 시 모든 뷰 정리
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_FOLDER_FILES);
	}

	// 뷰 활성화 (왼쪽 또는 오른쪽 사이드바)
	async activateView(side: 'left' | 'right') {
		const { workspace } = this.app;

		// 기존 뷰가 있는지 확인
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FOLDER_FILES);

		if (leaves.length > 0) {
			// 기존 뷰가 있으면 해당 뷰로 포커스
			leaf = leaves[0];
		} else {
			// 새 뷰 생성
			if (side === 'left') {
				leaf = workspace.getLeftLeaf(false);
			} else {
				leaf = workspace.getRightLeaf(false);
			}

			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_FOLDER_FILES,
					active: true
				});
			}
		}

		// 뷰 표시
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	// 뷰 닫기
	closeView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FOLDER_FILES);
		
		// 열려있는 모든 뷰 닫기
		leaves.forEach(leaf => {
			leaf.detach();
		});
	}

	// 이전 폴더로 이동
	async goToPreviousFolder() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_FILES);
		
		if (leaves.length === 0) {
			new Notice('폴더 파일 목록 뷰가 열려있지 않습니다.');
			return;
		}
		
		const view = leaves[0].view as FolderFilesView;
		
		if (!view.previousFolderPath) {
			new Notice('이전 폴더가 없습니다.');
			return;
		}
		
		// 이전 폴더의 파일 목록 가져오기
		const filesInPreviousFolder = this.app.vault.getFiles().filter(file => {
			const fileFolderPath = file.parent?.path || '';
			return fileFolderPath === view.previousFolderPath;
		});
		
		if (filesInPreviousFolder.length === 0) {
			new Notice('이전 폴더에 파일이 없습니다.');
			return;
		}
		
		// 가장 최근 수정된 파일 선택
		const sortedFiles = filesInPreviousFolder.sort((a, b) => 
			b.stat.mtime - a.stat.mtime
		);
		
		// 파일 열기
		await this.app.workspace.getLeaf().openFile(sortedFiles[0]);
	}

	// 파일 변경 공통 핸들러
	handleFileChange(changedFile: TFile, forceUpdate: boolean) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			// 활성 파일이 없으면 뷰는 빈 목록 상태이므로, 강제 업데이트일 때만 갱신
			if (forceUpdate) {
				this.updateAllViews(changedFile, true);
			}
			return;
		}

		const activeFolderPath = activeFile.parent?.path || '';
		const changedFolderPath = changedFile.parent?.path || '';

		// 강제 업데이트(생성/이름변경/수정)는 '현재 활성 폴더'에서 일어난 변경만 반영
		if (forceUpdate && changedFolderPath !== activeFolderPath) {
			return;
		}

		this.updateAllViews(activeFile, forceUpdate);
	}

	// 모든 뷰 업데이트
	updateAllViews(file: TFile, forceUpdate: boolean = false) {
		const folderPath = file.parent?.path || '';

		// 모든 뷰 찾기
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_FILES);
		
		leaves.forEach(leaf => {
			const view = leaf.view as FolderFilesView;
			
			// 강제 업데이트이거나 폴더가 바뀌었으면 전체 리렌더링
			if (forceUpdate || view.currentFolderPath !== folderPath) {
				view.updateView();
			} else {
				// 같은 폴더 내에서 파일만 바뀌면 하이라이트만 업데이트
				view.updateHighlight();
			}
		});
	}

}